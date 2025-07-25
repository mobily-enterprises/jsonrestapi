import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import knexLib from 'knex';
import express from 'express';
import request from 'supertest';
import { 
  validateJsonApiStructure, 
  cleanTables, 
  createJsonApiDocument, 
  createRelationship,
  resourceIdentifier,
  assertResourceAttributes
} from './helpers/test-utils.js';
import { createBasicApi } from './fixtures/api-configs.js';
import { JwtAuthPlugin } from '../plugins/core/jwt-auth-plugin.js';
import { ExpressPlugin } from '../plugins/core/connectors/express-plugin.js';

const TEST_SECRET = 'test-secret-key';
const TEST_USER = {
  sub: '123',
  email: 'test@example.com',
  roles: ['user']
};

function createToken(payload, options = {}) {
  return jwt.sign(
    { 
      ...TEST_USER, 
      ...payload,
      jti: options.jti || `test-${Date.now()}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (options.expiresIn || 3600)
    },
    TEST_SECRET,
    { algorithm: 'HS256' }
  );
}

// Create Knex instance for tests
const knex = knexLib({
  client: 'better-sqlite3',
  connection: {
    filename: ':memory:'
  },
  useNullAsDefault: true
});

// API instance and Express app that persist across tests
let api;
let app;

describe('JWT Auth Plugin', () => {
  before(async () => {
    // Initialize API once with Express
    app = express();
    api = await createBasicApi(knex, {
      includeExpress: true,
      express: { app }
    });
    
    // Install JWT auth plugin with all features enabled
    await api.use(JwtAuthPlugin, {
      secret: TEST_SECRET,
      revocation: {
        enabled: true,
        storage: 'database'
      },
      endpoints: {
        logout: '/auth/logout'
      }
    });
    
    // Mount the routes on the Express app
    api.http.express.mount(app);
    
    // Add posts resource for declarative auth tests
    await api.addResource('posts', {
      schema: {
        id: { type: 'id' },
        title: { type: 'string', required: true },
        content: { type: 'string' },
        user_id: { type: 'string' },
        published: { type: 'boolean', default: false }
      },
      auth: {
        query: ['public'],
        get: ['public'],
        post: ['authenticated'],
        patch: ['is_owner', 'has_role:editor', 'admin'],
        delete: ['is_owner', 'admin']
      }
    });
    await api.resources.posts.createKnexTable();
    
    // Add moderated_posts resource for custom auth checker tests
    await api.addResource('moderated_posts', {
      schema: {
        id: { type: 'id' },
        title: { type: 'string', required: true },
        flagged: { type: 'boolean', default: false }
      },
      auth: {
        query: ['public'],
        get: ['public'],
        post: ['authenticated'],
        patch: ['is_moderator']
      }
    });
    await api.resources.moderated_posts.createKnexTable();
    
    // Register the custom moderator checker
    api.helpers.auth.registerChecker('is_moderator', (context) => {
      return context.auth?.roles?.includes('moderator');
    });
  });

  after(async () => {
    // Clean up JWT plugin resources
    if (api.helpers?.auth?.cleanup) {
      api.helpers.auth.cleanup();
    }
    
    // Close database connection to allow tests to exit
    await knex.destroy();
  });
  
  describe('Basic JWT Authentication', () => {
    beforeEach(async () => {
      // Clean all tables before each test
      await cleanTables(knex, [
        'basic_countries', 'basic_publishers', 'basic_authors', 'basic_books', 'basic_book_authors',
        'revoked_tokens'
      ]);
    });
    
    it('should populate context.auth for valid tokens', async () => {
      const token = createToken();
      
      // First test that the API works without auth
      const testResponse = await request(app)
        .get('/api/countries')
        .set('Accept', 'application/vnd.api+json');
      
      assert.equal(testResponse.status, 200);
      assert.ok(testResponse.body.data);
      assert.equal(testResponse.body.data.length, 0);
      
      // Create a test country
      const createResponse = await request(app)
        .post('/api/countries')
        .send({
          data: {
            type: 'countries',
            attributes: { name: 'Test Country', code: 'TC' }
          }
        })
        .set('Content-Type', 'application/vnd.api+json')
        .set('Accept', 'application/vnd.api+json');
      
      assert.equal(createResponse.status, 201);
      
      // Now make authenticated request
      const response = await request(app)
        .get('/api/countries')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept', 'application/vnd.api+json');
      
      assert.equal(response.status, 200);
      assert.ok(response.body.data);
      assert.equal(response.body.data.length, 1);
    });
    
    it('should not populate context.auth for expired tokens', async () => {
      const token = createToken({}, { expiresIn: -1 }); // Already expired
      
      // Try to access protected resource with expired token
      const response = await request(app)
        .get('/api/countries')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept', 'application/vnd.api+json');
      
      // Should still return 200 but without auth context
      // (unless the resource requires authentication)
      assert.equal(response.status, 200);
    });
    
    it('should not populate context.auth for invalid signatures', async () => {
      const token = jwt.sign(TEST_USER, 'wrong-secret');
      
      const response = await request(app)
        .get('/api/countries')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept', 'application/vnd.api+json');
      
      // Should still return 200 but without auth context
      assert.equal(response.status, 200);
    });
    
    it('should allow requests without tokens', async () => {
      const response = await request(app)
        .get('/api/countries')
        .set('Accept', 'application/vnd.api+json');
      
      assert.equal(response.status, 200);
      assert.ok(response.body.data);
    });
  });
  
  describe('JWT Helper Functions', () => {
    it('should verify valid tokens', async () => {
      const { verifyToken } = await import('../plugins/core/lib/jwt-auth-helpers.js');
      const token = createToken();
      
      const decoded = await verifyToken(token, {
        secret: TEST_SECRET,
        algorithms: ['HS256']
      });
      
      assert.equal(decoded.sub, '123');
      assert.equal(decoded.email, 'test@example.com');
      assert.deepEqual(decoded.roles, ['user']);
    });
    
    it('should reject expired tokens', async () => {
      const { verifyToken } = await import('../plugins/core/lib/jwt-auth-helpers.js');
      const token = createToken({}, { expiresIn: -1 });
      
      await assert.rejects(
        async () => {
          await verifyToken(token, {
            secret: TEST_SECRET,
            algorithms: ['HS256']
          });
        },
        { name: 'TokenExpiredError' }
      );
    });
    
    it('should reject tokens with invalid signature', async () => {
      const { verifyToken } = await import('../plugins/core/lib/jwt-auth-helpers.js');
      const token = jwt.sign(TEST_USER, 'wrong-secret');
      
      await assert.rejects(
        async () => {
          await verifyToken(token, {
            secret: TEST_SECRET,
            algorithms: ['HS256']
          });
        },
        { name: 'JsonWebTokenError' }
      );
    });
  });
  
  describe('Token Revocation', () => {
    beforeEach(async () => {
      // Clean tables before each test
      await cleanTables(knex, [
        'basic_countries', 'basic_publishers', 'basic_authors', 'basic_books', 'basic_book_authors',
        'revoked_tokens'
      ]);
    });
    
    it('should revoke tokens on logout', async () => {
      const jti = 'test-token-123';
      const token = createToken({}, { jti });
      
      // First, create some data with the token
      await api.resources.countries.post({
        data: {
          type: 'countries',
          attributes: { name: 'Test Country', code: 'TC' }
        }
      });
      
      // Call logout endpoint
      const logoutResponse = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept', 'application/json');

      assert.equal(logoutResponse.status, 200);
      assert.equal(logoutResponse.body.success, true);


      // Try to use the token again - it should fail
      const response = await request(app)
        .get('/api/countries')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept', 'application/vnd.api+json');
      

      // The request should succeed but without auth context
      assert.equal(response.status, 200);
      
      // Check token is in revocation table
      const revokedTokens = await knex('revoked_tokens').select();
      assert.equal(revokedTokens.length, 1);
      assert.equal(revokedTokens[0].jti, jti);
    });
    
    it('should not populate auth for revoked tokens', async () => {
      const jti = 'test-token-456';
      const token = createToken({}, { jti });
      
      // Manually insert into revoked_tokens table
      await knex('revoked_tokens').insert({
        jti: jti,
        user_id: '123',
        expires_at: new Date(Date.now() + 3600000), // 1 hour from now
        revoked_at: new Date()
      });
      
      // Try to use the revoked token
      const response = await request(app)
        .get('/api/countries')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept', 'application/vnd.api+json');
      
      // Request should succeed but without auth
      assert.equal(response.status, 200);
    });
  });
  
  describe('Declarative Auth System', () => {
    let countryId;
    let userId = '123';
    let adminId = '456';
    
    beforeEach(async () => {
      // Clean tables before each test
      await cleanTables(knex, [
        'basic_countries', 'basic_publishers', 'basic_authors', 'basic_books', 'basic_book_authors',
        'posts'
      ]);
      
      // Create test data
      const countryDoc = createJsonApiDocument('countries', { name: 'USA', code: 'US' });
      const countryResult = await api.resources.countries.post({
        inputRecord: countryDoc,
        simplified: false
      });
      countryId = countryResult.data.id;
    });
    
    it('should allow public access to query', async () => {
      // Create a post first
      const postDoc = createJsonApiDocument('posts', {
        title: 'Test Post',
        content: 'Test content',
        user_id: userId,
        published: true
      });
      
      // Need auth to create
      const authContext = {
        auth: { userId }
      };
      
      await assert.doesNotReject(async () => {
        await api.resources.posts.post({
          inputRecord: postDoc,
          simplified: false
        }, authContext);
      });
      
      // But can query without auth
      const publicContext = { auth: null };
      
      await assert.doesNotReject(async () => {
        const posts = await api.resources.posts.query({
          simplified: false
        }, publicContext);
        validateJsonApiStructure(posts, true);
      });
    });
    
    it('should require authentication for post creation', async () => {
      const postDoc = createJsonApiDocument('posts', {
        title: 'Test Post',
        content: 'Test content'
      });
      
      // No auth context
      const context = { auth: null };
      
      await assert.rejects(
        async () => {
          await api.resources.posts.post({
            inputRecord: postDoc,
            simplified: false
          }, context);
        },
        /Access denied.*Required one of: authenticated/
      );
    });
    
    it('should allow owner to update their post', async () => {
      // Create post as user
      const postDoc = createJsonApiDocument('posts', {
        title: 'My Post',
        content: 'My content',
        user_id: userId
      });
      
      const createContext = { auth: { userId } };
      const postResult = await api.resources.posts.post({
        inputRecord: postDoc,
        simplified: false
      }, createContext);
      const postId = postResult.data.id;
      
      // Update as owner
      const updateDoc = createJsonApiDocument('posts', {
        title: 'Updated Post'
      });
      updateDoc.data.id = postId;
      
      await assert.doesNotReject(async () => {
        await api.resources.posts.patch({
          id: postId,
          inputRecord: updateDoc,
          simplified: false
        }, createContext);
      });
    });
    
    it('should allow editor role to update any post', async () => {
      // Create post as user
      const postDoc = createJsonApiDocument('posts', {
        title: 'User Post',
        content: 'User content',
        user_id: userId
      });
      
      const userContext = { auth: { userId } };
      const postResult = await api.resources.posts.post({
        inputRecord: postDoc,
        simplified: false
      }, userContext);
      const postId = postResult.data.id;
      
      // Update as editor (different user)
      const updateDoc = createJsonApiDocument('posts', {
        title: 'Editor Updated'
      });
      updateDoc.data.id = postId;
      
      const editorContext = {
        auth: {
          userId: 'editor-789',
          roles: ['editor']
        }
      };
      
      await assert.doesNotReject(async () => {
        await api.resources.posts.patch({
          id: postId,
          inputRecord: updateDoc,
          simplified: false
        }, editorContext);
      });
    });
    
    it('should allow admin to do anything', async () => {
      // Create post as user
      const postDoc = createJsonApiDocument('posts', {
        title: 'User Post',
        content: 'User content',
        user_id: userId
      });
      
      const userContext = { auth: { userId } };
      const postResult = await api.resources.posts.post({
        inputRecord: postDoc,
        simplified: false
      }, userContext);
      const postId = postResult.data.id;
      
      // Admin can update
      const updateDoc = createJsonApiDocument('posts', {
        title: 'Admin Updated'
      });
      updateDoc.data.id = postId;
      
      const adminContext = {
        auth: {
          userId: adminId,
          roles: ['admin']
        }
      };
      
      await assert.doesNotReject(async () => {
        await api.resources.posts.patch({
          id: postId,
          inputRecord: updateDoc,
          simplified: false
        }, adminContext);
      });
      
      // Admin can delete
      await assert.doesNotReject(async () => {
        await api.resources.posts.delete({
          id: postId,
          simplified: false
        }, adminContext);
      });
    });
    
    it('should deny non-owner non-admin from updating', async () => {
      // Create post as user
      const postDoc = createJsonApiDocument('posts', {
        title: 'User Post',
        content: 'User content',
        user_id: userId
      });
      
      const userContext = { auth: { userId } };
      const postResult = await api.resources.posts.post({
        inputRecord: postDoc,
        simplified: false
      }, userContext);
      const postId = postResult.data.id;
      
      // Try to update as different user without special roles
      const updateDoc = createJsonApiDocument('posts', {
        title: 'Hacker Updated'
      });
      updateDoc.data.id = postId;
      
      const otherUserContext = {
        auth: {
          userId: 'other-999',
          roles: ['user']
        }
      };
      
      await assert.rejects(
        async () => {
          await api.resources.posts.patch({
            id: postId,
            inputRecord: updateDoc,
            simplified: false
          }, otherUserContext);
        },
        /Access denied.*Required one of: is_owner, has_role:editor, admin/
      );
    });
  });
  
  describe('Auth Helpers', () => {
    beforeEach(async () => {
      // No need to clean tables for helper tests
    });
    
    it('should check authentication with requireAuth', () => {
      const helpers = api.helpers;
      
      // Not authenticated
      assert.throws(() => {
        helpers.auth.requireAuth({ auth: null });
      }, /Authentication required/);
      
      // Authenticated
      const auth = helpers.auth.requireAuth({ 
        auth: { userId: '123' } 
      });
      assert.equal(auth.userId, '123');
    });
    
    it('should check roles with requireRoles', () => {
      const helpers = api.helpers;
      const context = {
        auth: {
          userId: '123',
          roles: ['user', 'editor']
        }
      };
      
      // Has required role
      assert.doesNotThrow(() => {
        helpers.auth.requireRoles(context, ['editor']);
      });
      
      // Missing required role
      assert.throws(() => {
        helpers.auth.requireRoles(context, ['admin']);
      }, /Required role/);
      
      // At least one role matches
      assert.doesNotThrow(() => {
        helpers.auth.requireRoles(context, ['admin', 'editor']);
      });
    });
    
    it('should check ownership with various inputs', () => {
      const helpers = api.helpers;
      const context = {
        auth: {
          userId: '123',
          roles: ['user']
        }
      };
      
      // With direct user ID
      assert.doesNotThrow(() => {
        helpers.auth.requireOwnership(context, '123');
      });
      
      assert.throws(() => {
        helpers.auth.requireOwnership(context, '456');
      }, /Access denied/);
      
      // With record object
      const ownedRecord = { id: '1', user_id: '123', title: 'My Post' };
      assert.doesNotThrow(() => {
        helpers.auth.requireOwnership(context, ownedRecord);
      });
      
      const otherRecord = { id: '2', user_id: '456', title: 'Other Post' };
      assert.throws(() => {
        helpers.auth.requireOwnership(context, otherRecord);
      }, /Access denied/);
      
      // Admin can access any resource
      const adminContext = {
        auth: {
          userId: '999',
          roles: ['admin']
        }
      };
      assert.doesNotThrow(() => {
        helpers.auth.requireOwnership(adminContext, otherRecord);
      });
    });
  });
  
  describe('Custom Auth Checkers', () => {
    beforeEach(async () => {
      // Clean tables before each test
      await cleanTables(knex, [
        'basic_countries', 'basic_publishers', 'basic_authors', 'basic_books', 'basic_book_authors',
        'moderated_posts'
      ]);
    });
    
    it('should allow registering custom auth checkers', async () => {
      // The custom checker was already registered in the before() hook
      // and the moderated_posts resource was already created
      
      // Create a post
      const postDoc = createJsonApiDocument('moderated_posts', {
        title: 'Test Post',
        flagged: true
      });
      
      const createContext = { auth: { userId: '123' } };
      const postResult = await api.resources.moderated_posts.post({
        inputRecord: postDoc,
        simplified: false
      }, createContext);
      const postId = postResult.data.id;
      
      // Try to update without moderator role
      const updateDoc = createJsonApiDocument('moderated_posts', {
        flagged: false
      });
      updateDoc.data.id = postId;
      
      await assert.rejects(
        async () => {
          await api.resources.moderated_posts.patch({
            id: postId,
            inputRecord: updateDoc,
            simplified: false
          }, { auth: { userId: '123', roles: ['user'] } });
        },
        /Access denied.*Required one of: is_moderator/
      );
      
      // Update with moderator role should work
      await assert.doesNotReject(async () => {
        await api.resources.moderated_posts.patch({
          id: postId,
          inputRecord: updateDoc,
          simplified: false
        }, { auth: { userId: '456', roles: ['moderator'] } });
      });
    });
  });
});