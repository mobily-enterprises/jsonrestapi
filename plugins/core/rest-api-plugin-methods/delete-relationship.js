
import { RestApiResourceError } from "../../../lib/rest-api-errors.js";
import { findRelationshipDefinition } from "./common.js";

/**
 * DELETE RELATIONSHIP
 * Removes specific members from a to-many relationship
 * DELETE /api/articles/1/relationships/tags
 * 
 * @param {string} id - The ID of the resource
 * @param {string} relationshipName - The name of the relationship
 * @param {array} relationshipData - Array of resource identifiers to remove
 * @returns {Promise<void>} 204 No Content
 */
export default async function deleteRelationshipMethod({ params, context, vars, helpers, scope, scopes, runHooks, scopeName, api }) {
  context.method = 'deleteRelationship';
  context.id = params.id;
  context.relationshipName = params.relationshipName;
  context.schemaInfo = scopes[scopeName].vars.schemaInfo;

  // Transaction handling
  context.transaction = params.transaction || 
    (helpers.newTransaction && !params.transaction ? await helpers.newTransaction() : null);
  context.shouldCommit = !params.transaction && !!context.transaction;
  context.db = context.transaction || api.knex.instance

  try {
    // Validate
    const relDef = findRelationshipDefinition(context.schemaInfo, context.relationshipName);
    if (!relDef) {
      throw new RestApiResourceError(
        `Relationship '${context.relationshipName}' not found on resource '${scopeName}'`,
        { subtype: 'relationship_not_found' }
      );
    }

    if (!relDef.hasMany && !relDef.manyToMany) {
      throw new RestApiValidationError(
        `Cannot DELETE from to-one relationship '${context.relationshipName}'`,
        { fields: ['data'] }
      );
    }

    if (!Array.isArray(params.relationshipData)) {
      throw new RestApiPayloadError('DELETE from relationship requires array of resource identifiers');
    }

    // Check permissions
    await runHooks('checkPermissions');
    await runHooks('checkPermissionsDeleteRelationship');

    // Verify parent exists
    const exists = await helpers.dataExists({
      scopeName,
      context: {  db: context.db, id: context.id, schemaInfo: context.schemaInfo }
    });

    if (!exists) {
      throw new RestApiResourceError('Resource not found', { subtype: 'not_found' });
    }

    // Remove relationships
    if (relDef.manyToMany || (relDef.hasMany && relDef.through)) {
      const manyToManyDef = relDef.manyToMany || {
        through: relDef.through,
        foreignKey: relDef.foreignKey,
        otherKey: relDef.otherKey
      };

      const knex = api.knex?.instance || helpers.db;
      const pivotResource = manyToManyDef.through;
      const pivotScope = api.resources[pivotResource];
      const pivotTable = pivotScope?.vars?.schemaInfo?.tableName || pivotResource;
      const localKey = manyToManyDef.foreignKey;
      const foreignKey = manyToManyDef.otherKey;

      for (const identifier of params.relationshipData) {
        await knex(pivotTable)
          .where(localKey, context.id)
          .where(foreignKey, identifier.id)
          .delete()
          .transacting(context.transaction);
      }
    } else {
      // Null out foreign keys for hasMany
      const targetType = relDef.hasMany;
      for (const identifier of params.relationshipData) {
        await api.resources[targetType].patch({
          id: identifier.id,
          inputRecord: {
            data: {
              type: targetType,
              id: identifier.id,
              attributes: { [relDef.foreignKey]: null }
            }
          },
          transaction: context.transaction,
          simplified: false
        });
      }
    }

    await runHooks('finish');
    await runHooks('finishDeleteRelationship');

    if (context.shouldCommit) {
      await context.transaction.commit();
    }

    return; // 204 No Content

  } catch (error) {
    await handleWriteMethodError(error, context, 'DELETE_RELATIONSHIP', scopeName, log);
  }
}