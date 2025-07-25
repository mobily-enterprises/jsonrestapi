/**
 * @module knex-field-helpers
 * @description Context-dependent field helpers for Knex operations
 * 
 * This module contains field helper functions that require scope context and
 * dependencies. Pure utility functions have been moved to utils/field-utils.js.
 */

import { getForeignKeyFields, filterHiddenFields } from '../utils/field-utils.js';

// Re-export pure utility functions from field-utils
export { getForeignKeyFields, filterHiddenFields } from '../utils/field-utils.js';

/**
 * Helper function to check if a field should be excluded from database operations
 * @param {string} fieldName - The field name to check
 * @param {Object} schemaInfo - The schema info object containing computed and virtual fields
 * @returns {boolean} True if the field is non-database (computed or virtual)
 */
export const isNonDatabaseField = (fieldName, schemaInfo) => {
  const { computed = {}, virtual = {} } = schemaInfo;
  return fieldName in computed || fieldName in virtual;
};

/**
 * Builds the field selection list for database queries, handling sparse fieldsets.
 * 
 * This function constructs the SELECT clause fields based on JSON:API sparse fieldsets
 * while ensuring all necessary fields are included for proper relationship handling.
 * It always includes ID and foreign key fields even if not explicitly requested,
 * because these are needed for JSON:API relationship links.
 * 
 * @param {Object} scope - The scope object containing schema and configuration
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.context - Request context containing queryParams and schemaInfo
 * @returns {Promise<Object>} Object with fieldsToSelect, requestedFields, and computedDependencies
 * 
 * @example <caption>Sparse fieldset with automatic foreign key inclusion</caption>
 * const scope = api.resources['articles'];
 * const deps = {
 *   context: {
 *     scopeName: 'articles',
 *     queryParams: { fields: { articles: 'title,body' } },
 *     schemaInfo: scope.vars.schemaInfo
 *   }
 * };
 * const fieldInfo = await buildFieldSelection(scope, deps);
 * // Returns {
 * //   fieldsToSelect: ['id', 'title', 'body', 'author_id', 'category_id'],
 * //   requestedFields: ['title', 'body'],
 * //   computedDependencies: []
 * // }
 * 
 * @example <caption>With computed fields and dependencies</caption>
 * const deps = {
 *   context: {
 *     scopeName: 'products',
 *     queryParams: { fields: { products: 'name,profit_margin' } },
 *     schemaInfo: scope.vars.schemaInfo
 *   }
 * };
 * const fieldInfo = await buildFieldSelection(scope, deps);
 * // Returns {
 * //   fieldsToSelect: ['id', 'name', 'price', 'cost'], // cost needed for profit_margin
 * //   requestedFields: ['name', 'profit_margin'],
 * //   computedDependencies: ['cost'] // will be removed from final response
 * // }
 */
export const buildFieldSelection = async (scope, deps) => {
  let fieldsToSelect = new Set();
  let computedDependencies = new Set();

  // Extract values from scope
  const { 
    vars: { 
      schemaInfo: { schema, computed: computedFields = {}, virtual: virtualFields = {} }
    }
  } = scope;
  
  // Extract values from deps
  const { context } = deps;
  const scopeName = context.scopeName;
  const requestedFields = context.queryParams?.fields?.[scopeName];
  const idProperty = context.schemaInfo.idProperty;
  
  // Always include the ID field - required for JSON:API
  // Handle aliasing if idProperty is not 'id'
  if (idProperty !== 'id') {
    fieldsToSelect.add(`${idProperty} as id`);
  } else {
    fieldsToSelect.add('id');
  }
  
  // Get computed and virtual fields - these are not stored in the database
  // Computed: { profit_margin: { type: 'number', dependencies: ['price', 'cost'], compute: ... } }
  // Virtual: { passwordConfirmation: { type: 'string' } }
  const computedFieldNames = new Set(Object.keys(computedFields));
  const virtualFieldNames = new Set(Object.keys(virtualFields));
  const nonDatabaseFields = new Set([...computedFieldNames, ...virtualFieldNames]);
  
  // Handle both Schema objects and plain objects
  const schemaStructure = schema?.structure || schema || {};
  
  // Parse requested fields
  const requested = requestedFields ? (
    typeof requestedFields === 'string' 
      ? requestedFields.split(',').map(f => f.trim()).filter(f => f)
      : requestedFields
  ) : null;
  
  if (requested && requested.length > 0) {
    // Sparse fieldsets requested - only select specified fields
    // Example: ?fields[products]=name,price,profit_margin
    requested.forEach(field => {
      // Skip computed and virtual fields - they don't exist in database
      // Computed fields will be calculated later in enrichAttributes
      // Virtual fields are handled separately (from request input)
      if (nonDatabaseFields.has(field)) return;
      
      const fieldDef = schemaStructure[field];
      if (!fieldDef) throw new Error(`Unknown sparse field '${field}' requested for '${scopeName}'`);
      
      // NEVER include hidden fields, even if explicitly requested
      // Example: password_hash with hidden:true is never returned
      if (fieldDef.hidden === true) return;
      
      fieldsToSelect.add(field);
    });
    
    // Handle computed field dependencies - fetch fields needed for calculations
    // Example: User requests 'profit_margin' which depends on 'price' and 'cost'
    // We need to fetch price and cost from DB even if not explicitly requested
    const requestedComputedFields = requested.filter(f => computedFieldNames.has(f));
    for (const computedField of requestedComputedFields) {
      const fieldDef = computedFields[computedField];
      if (fieldDef.dependencies) {
        for (const dep of fieldDef.dependencies) {
          const depFieldDef = schemaStructure[dep];
          // Only add dependency if it exists and isn't hidden
          if (depFieldDef && depFieldDef.hidden !== true) {
            fieldsToSelect.add(dep);
            // Track dependencies that weren't explicitly requested
            // These will be removed from the final response
            if (!requested.includes(dep)) {
              computedDependencies.add(dep);
            }
          }
        }
      }
    }
    
    // Still handle normallyHidden fields for backward compatibility
    if (requestedComputedFields.length > 0) {
      Object.entries(schemaStructure).forEach(([field, fieldDef]) => {
        if (fieldDef.normallyHidden === true && fieldDef.hidden !== true) {
          // Only add if not already handled by dependencies
          if (!fieldsToSelect.has(field)) {
            fieldsToSelect.add(field);
            if (!requested.includes(field)) {
              computedDependencies.add(field);
            }
          }
        }
      });
    }
  } else {
    // No sparse fieldsets - return all visible fields
    // This is the default behavior when no ?fields parameter is provided
    Object.entries(schemaStructure).forEach(([field, fieldDef]) => {
      // Skip hidden fields - these are NEVER returned
      // Example: password_hash with hidden:true
      if (fieldDef.hidden === true) return;
      
      // Skip normallyHidden fields - these are hidden by default
      // Example: cost with normallyHidden:true (only returned when explicitly requested)
      if (fieldDef.normallyHidden === true) return;
      
      fieldsToSelect.add(field);
    });
    
    // When no sparse fieldsets, we compute all computed fields
    // So we need to include their dependencies even if normallyHidden
    // Example: profit_margin depends on 'cost' which is normallyHidden
    // We fetch 'cost' for calculation but don't return it in response
    for (const [fieldName, fieldDef] of Object.entries(computedFields)) {
      if (fieldDef.dependencies) {
        for (const dep of fieldDef.dependencies) {
          const depFieldDef = schemaStructure[dep];
          if (depFieldDef && depFieldDef.hidden !== true) {
            fieldsToSelect.add(dep);
            // Track normallyHidden dependencies for later removal
            // These are fetched for computation but not returned
            if (depFieldDef.normallyHidden === true) {
              computedDependencies.add(dep);
            }
          }
        }
      }
    }
  }
  
  // Always include foreign keys for relationships (unless hidden)
  Object.entries(schemaStructure).forEach(([field, fieldDef]) => {
    if (fieldDef.belongsTo && fieldDef.hidden !== true) {
      fieldsToSelect.add(field);
    }
  });
  
  // Always include polymorphic type and id fields from relationships
  try {
    const relationships = scope.vars.schemaInfo.schemaRelationships;
    Object.entries(relationships || {}).forEach(([relName, relDef]) => {
      if (relDef.belongsToPolymorphic) {
        if (relDef.typeField) fieldsToSelect.add(relDef.typeField);
        if (relDef.idField) fieldsToSelect.add(relDef.idField);
      }
    });
  } catch (e) {
    // Scope might not have relationships
  }
  
  // Return detailed information about field selection
  // This info is used by:
  // 1. SQL query builder to SELECT the right columns
  // 2. enrichAttributes to know which computed fields to calculate
  // 3. enrichAttributes to remove dependencies from final response
  return {
    fieldsToSelect: Array.from(fieldsToSelect),      // Fields to SELECT from database
    requestedFields: requested,                       // Fields explicitly requested by user
    computedDependencies: Array.from(computedDependencies),  // Dependencies to remove from response
    idProperty                                        // Pass idProperty for reference
  };
};

/**
 * Gets the list of requested computed fields based on sparse fieldsets.
 * 
 * @param {string} scopeName - The name of the scope/resource
 * @param {Array<string>|string} requestedFields - Array or comma-separated string of requested fields
 * @param {Object} computedFields - Object containing computed field definitions
 * @returns {Array<string>} Array of computed field names to calculate
 */
export const getRequestedComputedFields = (scopeName, requestedFields, computedFields) => {
  if (!computedFields) return [];
  
  const allComputedFields = Object.keys(computedFields);
  
  if (!requestedFields || requestedFields.length === 0) {
    // No sparse fieldsets - return all computed fields
    return allComputedFields;
  }
  
  // Parse requested fields if it's a string
  const requested = typeof requestedFields === 'string'
    ? requestedFields.split(',').map(f => f.trim()).filter(f => f)
    : requestedFields;
  
  // Return only requested computed fields that exist
  return requested.filter(field => allComputedFields.includes(field));
};

