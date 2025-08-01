import { Api } from 'hooked-api';
import { RestApiPlugin, RestApiKnexPlugin } from '../../index.js';
import { ExpressPlugin } from '../../plugins/core/connectors/express-plugin.js';
import express from 'express';
import { createServer } from 'http';

/**
 * Creates a basic API configuration with Countries, Publishers, Authors, Books
 */
export async function createBasicApi(knex, pluginOptions = {}) {
  const apiName = pluginOptions.apiName || `basic-test-api`;
  const tablePrefix = pluginOptions.tablePrefix || 'basic';
  const api = new Api({
    name: apiName,
    version: '1.0.0',
    log: { level: process.env.LOG_LEVEL || 'info' }
  });

  const restApiOptions = {
    simplifiedApi: false,
    simplifiedTransport: false,
    returnRecordApi: {
      post: true,  // Need to return record to get ID for tests
      put: false,
      patch: false
    },
    returnRecordTransport: {
      post: 'full',  // Tests expect full JSON:API response
      put: 'no',
      patch: 'minimal'  // Tests expect minimal response with ID
    },
    sortableFields: ['id', 'title', 'country_id', 'publisher_id', 'name', 'code'],
    ...pluginOptions['rest-api']  // Merge any custom options for rest-api plugin
  };

  await api.use(RestApiPlugin, restApiOptions);
  
  await api.use(RestApiKnexPlugin, { knex });
  
  // Add Express plugin if requested
  if (pluginOptions.includeExpress) {
    await api.use(ExpressPlugin, {
      mountPath: '/api',  // Default mount path for tests
      ...(pluginOptions.express || {})
    });
  }

  // Countries table
  await api.addResource('countries', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 100, search: true },
      code: { type: 'string', max: 2, unique: true }
    },
    relationships: {
      publishers: { hasMany: 'publishers', foreignKey: 'country_id' },
      books: { hasMany: 'books', foreignKey: 'country_id' }
    },
    tableName: `${tablePrefix}_countries`
  });
  await api.resources.countries.createKnexTable();

  // Publishers table
  await api.addResource('publishers', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 },
      country_id: { type: 'number', nullable: true, belongsTo: 'countries', as: 'country' }
    },
    relationships: {
      books: { hasMany: 'books', foreignKey: 'publisher_id' }
    },
    tableName: `${tablePrefix}_publishers`
  });
  await api.resources.publishers.createKnexTable();

  // Authors table
  await api.addResource('authors', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 }
    },
    relationships: {
      books: { hasMany: 'books', through: 'book_authors', foreignKey: 'author_id', otherKey: 'book_id' }
    },
    tableName: `${tablePrefix}_authors`
  });
  await api.resources.authors.createKnexTable();

  // Books table
  await api.addResource('books', {
    schema: {
      id: { type: 'id' },
      title: { type: 'string', required: true, max: 300, search: true },
      country_id: { type: 'number', required: true, belongsTo: 'countries', as: 'country', search: true },
      publisher_id: { type: 'number', belongsTo: 'publishers', as: 'publisher', search: true }
    },
    relationships: {
      authors: { hasMany: 'authors', through: 'book_authors', foreignKey: 'book_id', otherKey: 'author_id' }
    },
    tableName: `${tablePrefix}_books`
  });
  await api.resources.books.createKnexTable();

  // Book-Authors pivot table
  await api.addResource('book_authors', {
    schema: {
      id: { type: 'id' },
      book_id: { type: 'number', required: true, belongsTo: 'books', as: 'book' },
      author_id: { type: 'number', required: true, belongsTo: 'authors', as: 'author' }
    },
    tableName: `${tablePrefix}_book_authors`
  });
  await api.resources.book_authors.createKnexTable();

  return api;
}

/**
 * Creates a basic API with bulk operations enabled
 */
export async function createBulkOperationsApi(knex, pluginOptions = {}) {
  const { BulkOperationsPlugin } = await import('../../plugins/core/bulk-operations-plugin.js');
  
  const api = await createBasicApi(knex, pluginOptions);
  
  // Add bulk operations plugin
  await api.use(BulkOperationsPlugin, {
    'bulk-operations': {
      maxBulkOperations: 100,
      defaultAtomic: true,
      batchSize: 10,
      enableOptimizations: true,
      ...pluginOptions['bulk-operations']
    }
  });
  
  return api;
}

/**
 * Creates an extended API with additional fields for more complex testing
 */
export async function createExtendedApi(knex) {
  const api = new Api({
    name: 'extended-test-api',
    version: '1.0.0'
  });

  await api.use(RestApiPlugin, {
    simplifiedApi: false,
    simplifiedTransport: false,
    returnRecordApi: {
      post: true,  // Need to return record to get ID for tests
      put: false,
      patch: false
    },
    returnRecordTransport: {
      post: 'full',  // Tests expect full JSON:API response
      put: 'no',
      patch: 'minimal'  // Tests expect minimal response with ID
    },
    sortableFields: ['id', 'title', 'country_id', 'publisher_id', 'price', 'language', 'population', 'name', 'code']
  });
  
  await api.use(RestApiKnexPlugin, { knex });

  // Countries with extended fields
  await api.addResource('countries', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 100 },
      code: { type: 'string', max: 2, unique: true },
      capital: { type: 'string', max: 100 },
      population: { type: 'number' },
      currency: { type: 'string', max: 3 }
    },
    relationships: {
      publishers: { hasMany: 'publishers', foreignKey: 'country_id' },
      books: { hasMany: 'books', foreignKey: 'country_id' },
      authors: { hasMany: 'authors', foreignKey: 'nationality_id' }
    },
    tableName: 'ext_countries'
  });
  await api.resources.countries.createKnexTable();

  // Publishers with extended fields
  await api.addResource('publishers', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 },
      country_id: { type: 'number', nullable: true, belongsTo: 'countries', as: 'country' },
      founded_year: { type: 'number' },
      website: { type: 'string', max: 255 },
      active: { type: 'boolean', default: true }
    },
    relationships: {
      books: { hasMany: 'books', foreignKey: 'publisher_id' },
      reviews: { 
        hasMany: 'reviews', 
        via: 'reviewable'
      }
    },
    tableName: 'ext_publishers'
  });
  await api.resources.publishers.createKnexTable();

  // Authors with extended fields
  await api.addResource('authors', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 },
      birth_date: { type: 'date' },
      biography: { type: 'string', max: 5000 },
      nationality_id: { type: 'number', belongsTo: 'countries', as: 'nationality' }
    },
    relationships: {
      books: { hasMany: 'books', through: 'book_authors', foreignKey: 'author_id', otherKey: 'book_id' },
      reviews: { 
        hasMany: 'reviews', 
        via: 'reviewable'
      }
    },
    tableName: 'ext_authors'
  });
  await api.resources.authors.createKnexTable();

  // Books with extended fields
  await api.addResource('books', {
    schema: {
      id: { type: 'id' },
      title: { type: 'string', required: true, max: 300, search: true },
      isbn: { type: 'string', max: 13 },
      pages: { type: 'number' },
      price: { type: 'number', search: true }, // Store price as string for decimal precision
      published_date: { type: 'date' },
      language: { type: 'string', max: 2, default: 'en', search: true },
      country_id: { type: 'number', required: true, belongsTo: 'countries', as: 'country', search: true },
      publisher_id: { type: 'number', belongsTo: 'publishers', as: 'publisher', search: true }
    },
    relationships: {
      authors: { hasMany: 'authors', through: 'book_authors', foreignKey: 'book_id', otherKey: 'author_id' },
      reviews: { 
        hasMany: 'reviews', 
        via: 'reviewable'
      }
    },
    tableName: 'ext_books'
  });
  await api.resources.books.createKnexTable();

  // Book-Authors pivot with extended fields
  await api.addResource('book_authors', {
    schema: {
      id: { type: 'id' },
      book_id: { type: 'number', required: true, belongsTo: 'books', as: 'book' },
      author_id: { type: 'number', required: true, belongsTo: 'authors', as: 'author' },
      contribution_type: { type: 'string', max: 50 },
      order: { type: 'number' }
    },
    tableName: 'ext_book_authors'
  });
  await api.resources.book_authors.createKnexTable();

  // Polymorphic reviews (can go on authors, books and publishers)
  await api.addResource('reviews', {
    schema: {
      id: { type: 'id' },
      rating: { type: 'number', required: true, min: 1, max: 5 },
      title: { type: 'string', max: 200 },
      content: { type: 'string', required: true, max: 5000 },
      reviewer_name: { type: 'string', required: true, max: 100 },
      review_date: { type: 'dateTime', default: 'now()' },
      helpful_count: { type: 'number', default: 0 },
      reviewable_type: { type: 'string', required: true },
      reviewable_id: { type: 'number', required: true }
    },
    relationships: {
      reviewable: {
        belongsToPolymorphic: {
          types: ['books', 'authors', 'publishers'],
          typeField: 'reviewable_type',
          idField: 'reviewable_id'
        }
      }
    },
    tableName: 'ext_reviews'
  });
  await api.resources.reviews.createKnexTable();


  return api;
}

/**
 * Creates an API with limited include depth for testing depth validation
 * Uses 'limited_' prefix for all tables to avoid conflicts
 */
export async function createLimitedDepthApi(knex) {
  const api = new Api({
    name: 'limited-depth-api',
    version: '1.0.0'
  });

  await api.use(RestApiPlugin, {
    simplifiedApi: false,
    simplifiedTransport: false,
    returnRecordApi: {
      post: true,
      put: false,
      patch: false
    },
    returnRecordTransport: {
      post: 'full',
      put: 'no',
      patch: 'minimal'
    },
    sortableFields: ['id', 'title', 'country_id', 'publisher_id', 'name', 'code'],
    includeDepthLimit: 2  // Key difference: limit is 2 instead of default 3
  });
  
  await api.use(RestApiKnexPlugin, { knex });

  // Use different table names with 'limited_' prefix to avoid conflicts
  await api.addResource('countries', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 100 },
      code: { type: 'string', max: 2, unique: true }
    },
    relationships: {
      publishers: { hasMany: 'publishers', foreignKey: 'country_id' },
      books: { hasMany: 'books', foreignKey: 'country_id' }
    },
    tableName: 'limited_countries',
  });
  await api.resources.countries.createKnexTable();

  await api.addResource('publishers', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 },
      country_id: { type: 'number', nullable: true, belongsTo: 'countries', as: 'country' }
    },
    relationships: {
      books: { hasMany: 'books', foreignKey: 'publisher_id' },
      authors: { hasMany: 'authors', foreignKey: 'publisher_id' }
    },
    tableName: 'limited_publishers'
  });
  await api.resources.publishers.createKnexTable();

  await api.addResource('authors', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 },
      publisher_id: { type: 'number', nullable: true, belongsTo: 'publishers', as: 'publisher' }
    },
    relationships: {
      books: { hasMany: 'books', through: 'book_authors', foreignKey: 'author_id', otherKey: 'book_id' }
    },
    tableName: 'limited_authors'
  });
  await api.resources.authors.createKnexTable();

  await api.addResource('books', {
    schema: {
      id: { type: 'id' },
      title: { type: 'string', required: true, max: 300, search: true },
      country_id: { type: 'number', required: true, belongsTo: 'countries', as: 'country', search: true },
      publisher_id: { type: 'number', belongsTo: 'publishers', as: 'publisher', search: true }
    },
    relationships: {
      authors: { hasMany: 'authors', through: 'book_authors', foreignKey: 'book_id', otherKey: 'author_id' }
    },
    tableName: 'limited_books'
  });
  await api.resources.books.createKnexTable();

  await api.addResource('book_authors', {
    schema: {
      id: { type: 'id' },
      book_id: { type: 'number', required: true, belongsTo: 'books', as: 'book' },
      author_id: { type: 'number', required: true, belongsTo: 'authors', as: 'author' }
    },
    tableName: 'limited_book_authors'
  });
  await api.resources.book_authors.createKnexTable();

  return api;
}

/**
 * Creates an API configuration for pagination testing
 */
export async function createPaginationApi(knex, options = {}) {
  const api = new Api({
    name: 'pagination-test-api',
    version: '1.0.0'
  });

  const restApiOptions = {
    simplifiedApi: false,
    simplifiedTransport: false,
    returnRecordApi: {
      post: true,
      put: false,
      patch: false
    },
    returnRecordTransport: {
      post: 'full',
      put: 'no',
      patch: 'minimal'
    },
    sortableFields: ['id', 'title', 'country_id', 'publisher_id', 'name', 'code'],
    ...options  // Allow overriding options like publicBaseUrl, enablePaginationCounts
  };

  await api.use(RestApiPlugin, restApiOptions);
  
  await api.use(RestApiKnexPlugin, { knex });

  // Countries table
  await api.addResource('countries', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 100 },
      code: { type: 'string', max: 2, unique: true }
    },
    relationships: {
      publishers: { hasMany: 'publishers', foreignKey: 'country_id' },
      books: { hasMany: 'books', foreignKey: 'country_id' }
    },
    tableName: 'pagination_countries'
  });
  await api.resources.countries.createKnexTable();

  // Publishers table
  await api.addResource('publishers', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 },
      country_id: { type: 'number', nullable: true, belongsTo: 'countries', as: 'country' }
    },
    relationships: {
      books: { hasMany: 'books', foreignKey: 'publisher_id' }
    },
    tableName: 'pagination_publishers'
  });
  await api.resources.publishers.createKnexTable();

  // Books table
  await api.addResource('books', {
    schema: {
      id: { type: 'id' },
      title: { type: 'string', required: true, max: 300, search: true },
      country_id: { type: 'number', required: true, belongsTo: 'countries', as: 'country', search: true },
      publisher_id: { type: 'number', belongsTo: 'publishers', as: 'publisher', search: true }
    },
    tableName: 'pagination_books'
  });
  await api.resources.books.createKnexTable();

  return api;
}

/**
 * Creates an API with WebSocket/Socket.IO support for testing
 */
export async function createWebSocketApi(knex, pluginOptions = {}) {
  const { SocketIOPlugin } = await import('../../plugins/core/socketio-plugin.js');
  const { JwtAuthPlugin } = await import('../../plugins/core/jwt-auth-plugin.js');
  
  const api = await createBasicApi(knex, {
    ...pluginOptions,
    includeExpress: true,
    express: {
      port: 0 // Let OS assign a port
    }
  });
  
  // Add JWT auth plugin (required by SocketIO plugin)
  await api.use(JwtAuthPlugin, {
    secret: 'test-secret-key',
    expiresIn: '1h'
  });
  
  // Add SocketIO plugin
  await api.use(SocketIOPlugin, pluginOptions['socketio'] || {});
  
  // Create and start Express server
  const app = express();
  api.http.express.app = app;
  
  // Mount the API routes
  app.use('/api', api.http.express.router);
  
  // Create HTTP server
  const server = createServer(app);
  
  // Start Socket.IO server
  await api.startSocketServer(server);
  
  // Start listening
  await new Promise((resolve) => {
    server.listen(0, () => {
      resolve();
    });
  });
  
  return { api, server };
}

/**
 * Creates an API with computed fields for testing
 */
export async function createComputedFieldsApi(knex, pluginOptions = {}) {
  const api = new Api({
    name: 'computed-fields-test-api',
    version: '1.0.0',
    log: { level: process.env.LOG_LEVEL || 'info' }
  });

  await api.use(RestApiPlugin, {
    simplifiedApi: true,
    simplifiedTransport: true
  });
  
  await api.use(RestApiKnexPlugin, { knex });

  // Products resource with computed fields
  await api.addResource('products', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 255 },
      price: { type: 'number', required: true, min: 0 },
      cost: { type: 'number', required: true, min: 0, normallyHidden: true },
      internal_notes: { type: 'string', normallyHidden: true },
      profit_margin: {
        type: 'number',
        computed: true,
        dependencies: ['price', 'cost'],
        compute: ({ attributes }) => {
          if (!attributes.price || attributes.price === 0) return 0;
          return Number(((attributes.price - attributes.cost) / attributes.price * 100).toFixed(2));
        }
      },
      profit_amount: {
        type: 'number',
        computed: true,
        dependencies: ['price', 'cost'],
        compute: ({ attributes }) => {
          return Number((attributes.price - attributes.cost).toFixed(2));
        }
      }
    },
    relationships: {
      reviews: { hasMany: 'reviews', foreignKey: 'product_id' }
    },
    tableName: 'test_products'
  });
  await api.resources.products.createKnexTable();

  // Reviews resource with computed fields
  await api.addResource('reviews', {
    schema: {
      id: { type: 'id' },
      product_id: { type: 'number', required: true, belongsTo: 'products', as: 'product' },
      reviewer_name: { type: 'string', required: true },
      rating: { type: 'number', required: true, min: 1, max: 5 },
      comment: { type: 'string', max: 1000 },
      helpful_votes: { type: 'number', default: 0 },
      total_votes: { type: 'number', default: 0 },
      spam_score: { type: 'number', default: 0, normallyHidden: true },
      helpfulness_score: {
        type: 'number',
        computed: true,
        dependencies: ['helpful_votes', 'total_votes'],
        compute: ({ attributes }) => {
          if (attributes.total_votes === 0) return null;
          return Number(((attributes.helpful_votes / attributes.total_votes) * 100).toFixed(0));
        }
      },
      is_helpful: {
        type: 'boolean',
        computed: true,
        dependencies: ['helpful_votes', 'total_votes', 'spam_score'],
        compute: ({ attributes }) => {
          if (attributes.total_votes < 10) return null;
          const helpfulnessScore = (attributes.helpful_votes / attributes.total_votes) * 100;
          return helpfulnessScore > 70 && attributes.spam_score < 0.5;
        }
      }
    },
    tableName: 'test_reviews'
  });
  await api.resources.reviews.createKnexTable();

  return api;
}

/**
 * Creates an API with field getters for testing
 */
export async function createFieldGettersApi(knex, pluginOptions = {}) {
  const api = new Api({
    name: 'field-getters-test-api',
    version: '1.0.0',
    log: { level: process.env.LOG_LEVEL || 'info' }
  });

  await api.use(RestApiPlugin, {
    simplifiedApi: true,
    simplifiedTransport: true
  });
  
  await api.use(RestApiKnexPlugin, { knex });

  // Users resource with basic getters
  await api.addResource('users', {
    schema: {
      id: { type: 'id' },
      email: { 
        type: 'string',
        nullable: true,
        getter: (value) => value?.toLowerCase().trim()
      },
      name: {
        type: 'string',
        nullable: true,
        getter: (value) => value?.trim()
      },
      phone: {
        type: 'string',
        nullable: true,
        getter: (value) => {
          if (!value) return null;
          // Remove all non-digits and format
          const digits = value.replace(/\D/g, '');
          if (digits.length === 10) {
            return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
          }
          return value;
        }
      },
      metadata_json: {
        type: 'string',
        nullable: true,
        getter: (value) => {
          if (!value) return {};
          try {
            return JSON.parse(value);
          } catch {
            return {};
          }
        }
      },
      tags_csv: {
        type: 'string',
        nullable: true,
        getter: (value) => {
          if (!value) return [];
          return value.split(',').map(t => t.trim()).filter(t => t);
        }
      }
    },
    tableName: 'getter_users'
  });
  await api.resources.users.createKnexTable();

  // Products resource with getters and computed fields
  await api.addResource('products', {
    schema: {
      id: { type: 'id' },
      name: {
        type: 'string',
        getter: (value) => value?.toUpperCase()
      },
      description: {
        type: 'string',
        getter: (value) => {
          // Truncate long descriptions
          if (!value) return '';
          return value.length > 50 ? value.substring(0, 47) + '...' : value;
        }
      },
      price_str: {
        type: 'string',
        getter: (value) => parseFloat(value) || 0
      },
      tax_rate_str: {
        type: 'string',
        getter: (value) => parseFloat(value) || 0
      },
      total_price: {
        type: 'number',
        computed: true,
        dependencies: ['price_str', 'tax_rate_str'],
        compute: ({ attributes }) => {
          // Should see numbers from getters, not strings
          return attributes.price_str * (1 + attributes.tax_rate_str);
        }
      }
    },
    relationships: {
      reviews: { hasMany: 'reviews', foreignKey: 'product_id' }
    },
    tableName: 'getter_products'
  });
  await api.resources.products.createKnexTable();

  // Reviews resource with getters
  await api.addResource('reviews', {
    schema: {
      id: { type: 'id' },
      product_id: { type: 'id', belongsTo: 'products', as: 'product' },
      content: {
        type: 'string',
        getter: (value) => `[REVIEW] ${value}`
      },
      rating: { type: 'number' }
    },
    tableName: 'getter_reviews'
  });
  await api.resources.reviews.createKnexTable();

  // Resource with getter dependencies
  await api.addResource('formatted_data', {
    schema: {
      id: { type: 'id' },
      step1: {
        type: 'string',
        nullable: true,
        getter: (value) => value?.trim()
      },
      step2: {
        type: 'string',
        nullable: true, 
        getter: (value, { attributes }) => {
          if (!value) return value; // Return null/undefined as-is
          // Depends on step1 being trimmed first
          return `${value} [step1: ${attributes.step1}]`;
        },
        runGetterAfter: ['step1']
      },
      step3: {
        type: 'string',
        getter: (value, { attributes }) => {
          if (!value) return value; // Return null/undefined as-is
          // Depends on step2
          return `${value} [step2: ${attributes.step2}]`;
        },
        runGetterAfter: ['step2']
      }
    },
    tableName: 'getter_formatted'
  });
  await api.resources.formatted_data.createKnexTable();

  // Async getters example
  await api.addResource('encrypted_data', {
    schema: {
      id: { type: 'id' },
      secret: {
        type: 'string',
        nullable: true,
        getter: async (value) => {
          if (!value) return null;
          // Simulate async decryption
          await new Promise(resolve => setTimeout(resolve, 5));
          return Buffer.from(value, 'base64').toString();
        }
      },
      data: {
        type: 'string',
        nullable: true,
        getter: async (value, context) => {
          if (!value) return null;
          await new Promise(resolve => setTimeout(resolve, 5));
          const decrypted = Buffer.from(value, 'base64').toString();
          return `[${context.scopeName}] ${decrypted}`;
        }
      }
    },
    tableName: 'getter_encrypted'
  });
  await api.resources.encrypted_data.createKnexTable();

  return api;
}

/**
 * Creates an API with field setters for testing
 */
export async function createFieldSettersApi(knex, pluginOptions = {}) {
  const api = new Api({
    name: 'field-setters-test-api',
    version: '1.0.0',
    log: { level: process.env.LOG_LEVEL || 'info' }
  });

  await api.use(RestApiPlugin, {
    simplifiedApi: true,
    simplifiedTransport: true,
    returnRecordApi: {
      post: true,
      put: true,
      patch: true
    }
  });
  
  await api.use(RestApiKnexPlugin, { knex });

  // Users resource with basic setters
  await api.addResource('users', {
    schema: {
      id: { type: 'id' },
      email: { 
        type: 'string',
        required: true,
        setter: (value) => value?.toLowerCase().trim()
      },
      username: {
        type: 'string',
        required: true,
        setter: (value) => value?.toLowerCase().replace(/\s+/g, '')
      },
      tags: {
        type: 'string',  // Accepts string, stored as string
        setter: (value) => value  // Pass through
      },
      preferences: {
        type: 'string',  // Accepts string, stored as string  
        setter: (value) => value  // Pass through
      }
    },
    tableName: 'setter_users'
  });
  await api.resources.users.createKnexTable();

  // Products with type conversion setters
  await api.addResource('products', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true },
      price: {
        type: 'number',
        required: true,
        min: 0,
        setter: (value) => {
          // Convert to cents and round
          return Math.round(value * 100);
        }
      },
      discount_percent: {
        type: 'number',
        min: 0,
        max: 100,
        setter: (value) => Math.round(value)
      },
      metadata: {
        type: 'object',
        setter: (value) => JSON.stringify(value || {})
      }
    },
    tableName: 'setter_products'
  });
  await api.resources.products.createKnexTable();

  // Secure data with async setters
  await api.addResource('secure_data', {
    schema: {
      id: { type: 'id' },
      password: {
        type: 'string',
        required: true,
        min: 8,
        setter: async (value) => {
          // Simulate async password hashing
          await new Promise(resolve => setTimeout(resolve, 5));
          return `hashed:${value}`;
        }
      },
      api_key: {
        type: 'string',
        setter: async (value) => {
          if (!value) return null;
          // Simulate encryption
          await new Promise(resolve => setTimeout(resolve, 5));
          return Buffer.from(value).toString('base64');
        }
      },
      data: {
        type: 'string',
        setter: async (value) => {
          if (!value) return null;
          return Buffer.from(value).toString('base64');
        }
      }
    },
    tableName: 'setter_secure'
  });
  await api.resources.secure_data.createKnexTable();

  // Resource with setter dependencies
  await api.addResource('computed_data', {
    schema: {
      id: { type: 'id' },
      base_value: { 
        type: 'number',
        setter: (value) => value || 0
      },
      multiplier: { 
        type: 'number',
        setter: (value) => value || 1
      },
      adjustment: { 
        type: 'number',
        setter: (value) => value || 0
      },
      calculated_value: {
        type: 'number',
        setter: (value, { attributes }) => {
          // Calculate based on other fields
          return (attributes.base_value || 0) * (attributes.multiplier || 1);
        },
        runSetterAfter: ['base_value', 'multiplier']
      },
      final_value: {
        type: 'number',
        setter: (value, { attributes }) => {
          // Depends on calculated_value
          return (attributes.calculated_value || 0) + (attributes.adjustment || 0);
        },
        runSetterAfter: ['calculated_value', 'adjustment']
      }
    },
    tableName: 'setter_computed'
  });
  await api.resources.computed_data.createKnexTable();

  // Nullable fields handling
  await api.addResource('nullable_data', {
    schema: {
      id: { type: 'id' },
      field1: {
        type: 'string',
        nullable: true,
        setter: (value) => value === undefined ? null : value
      },
      field2: {
        type: 'string',
        nullable: true,
        setter: (value) => value === undefined ? null : value
      },
      field3: {
        type: 'string',
        setter: (value) => value === '' ? 'empty' : value
      },
      field4: {
        type: 'number',
        setter: (value) => value === 0 ? -1 : value
      }
    },
    tableName: 'setter_nullable'
  });
  await api.resources.nullable_data.createKnexTable();

  // Validated data
  await api.addResource('validated_data', {
    schema: {
      id: { type: 'id' },
      email: {
        type: 'string',
        required: true,
        format: 'email',
        setter: (value) => value.toLowerCase().trim()
      },
      age: {
        type: 'number',
        min: 0,
        max: 120,
        setter: (value) => value // No transformation, just to verify it's a number
      },
      score: {
        type: 'number',
        min: 0,
        max: 100,
        setter: (value) => Math.ceil(value) // Round up
      }
    },
    tableName: 'setter_validated'
  });
  await api.resources.validated_data.createKnexTable();

  return api;
}

export async function createMultiHomeApi(knex, pluginOptions = {}) {
  const { MultiHomePlugin } = await import('../../plugins/core/rest-api-multihome-plugin.js');
  
  const api = new Api({
    name: 'multihome-test-api',
    version: '1.0.0'
  });

  await api.use(RestApiPlugin, {
    simplifiedApi: false,
    simplifiedTransport: false,
    returnRecordApi: {
      post: true,
      put: false,
      patch: false
    },
    returnRecordTransport: {
      post: 'full',
      put: 'no',
      patch: 'minimal'
    },
    sortableFields: ['id', 'title', 'name', 'tenant_id']
  });
  
  await api.use(RestApiKnexPlugin, { knex });
  
  // Add Express plugin if requested for transport testing
  if (pluginOptions.includeExpress) {
    await api.use(ExpressPlugin, pluginOptions.express || {});
  }
  
  // Add MultiHome plugin with configuration
  await api.use(MultiHomePlugin, {
    field: pluginOptions.field || 'tenant_id',
    excludeResources: pluginOptions.excludeResources || ['system_settings'],
    requireAuth: pluginOptions.requireAuth !== undefined ? pluginOptions.requireAuth : true,
    allowMissing: pluginOptions.allowMissing || false,
    extractor: pluginOptions.extractor || ((request) => {
      // Default to header extraction for tests
      return request.headers?.['x-tenant-id'] || null;
    })
  });

  // Tenant-specific resources
  await api.addResource('projects', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 },
      description: { type: 'string', max: 1000 },
      status: { type: 'string', defaultTo: 'active' },
      tenant_id: { type: 'string', required: true }
    },
    relationships: {
      tasks: { hasMany: 'tasks', foreignKey: 'project_id' }
    },
    tableName: 'multihome_projects'
  });
  await api.resources.projects.createKnexTable();

  await api.addResource('tasks', {
    schema: {
      id: { type: 'id' },
      title: { type: 'string', required: true, max: 200 },
      completed: { type: 'boolean', defaultTo: false },
      project_id: { type: 'number', belongsTo: 'projects', as: 'project' },
      tenant_id: { type: 'string', required: true }
    },
    tableName: 'multihome_tasks'
  });
  await api.resources.tasks.createKnexTable();

  await api.addResource('users', {
    schema: {
      id: { type: 'id' },
      email: { type: 'string', required: true, unique: true },
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'member', search: true },
      tenant_id: { type: 'string', required: true }
    },
    tableName: 'multihome_users'
  });
  await api.resources.users.createKnexTable();

  // Global resource (excluded from multihome)
  await api.addResource('system_settings', {
    schema: {
      id: { type: 'id' },
      key: { type: 'string', required: true, unique: true },
      value: { type: 'string', required: true }
    },
    tableName: 'multihome_system_settings'
  });
  await api.resources.system_settings.createKnexTable();

  return api;
}

/**
 * Creates an API with positioning support for testing
 */
export async function createPositioningApi(knex, pluginOptions = {}) {
  const apiName = pluginOptions.apiName || 'positioning-test-api';
  const tablePrefix = pluginOptions.tablePrefix || 'positioning';
  const api = new Api({
    name: apiName,
    version: '1.0.0'
  });

  const restApiOptions = {
    simplifiedApi: true,  // Changed to true to allow simplified API calls in tests
    simplifiedTransport: false,
    returnRecordApi: {
      post: true,
      put: true,
      patch: true
    },
    returnRecordTransport: {
      post: 'full',
      put: 'full',
      patch: 'full'
    },
    sortableFields: ['id', 'title', 'name', 'position', 'sort_order', 'category_id', 'project_id', 'status'],
    ...pluginOptions['rest-api']
  };

  await api.use(RestApiPlugin, restApiOptions);
  await api.use(RestApiKnexPlugin, { knex });

  // Categories (for grouping tasks)
  await api.addResource('categories', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 100 }
    },
    tableName: `${tablePrefix}_categories`
  });
  await api.resources.categories.createKnexTable();

  // Tasks (main positioning test resource)
  await api.addResource('tasks', {
    schema: {
      id: { type: 'id' },
      title: { type: 'string', required: true, max: 200 },
      category_id: { type: 'number', nullable: true, belongsTo: 'categories', as: 'category', search: true },
      position: { type: 'string', max: 255, nullable: true },
      beforeId: { type: 'string', virtual: true }, // Virtual field for positioning
      deleted_at: { type: 'dateTime', nullable: true, search: true }, // For soft delete tests
      version: { type: 'number', defaultTo: 1, search: true } // For versioning tests
    },
    relationships: {
      category: { belongsTo: 'categories' }
    },
    tableName: `${tablePrefix}_tasks`
  });
  await api.resources.tasks.createKnexTable();

  // Projects (for multi-filter testing)
  await api.addResource('projects', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 100 }
    },
    tableName: `${tablePrefix}_projects`
  });
  await api.resources.projects.createKnexTable();

  // Items (flexible resource for various positioning tests)
  await api.addResource('items', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200 },
      project_id: { type: 'number', nullable: true, belongsTo: 'projects', as: 'project', search: true },
      status: { type: 'string', defaultTo: 'active', nullable: true, search: true },
      position: { type: 'string', max: 255, nullable: true },
      sort_order: { type: 'string', max: 255, nullable: true }, // Alternative position field
      beforeId: { type: 'string', virtual: true },
      priority: { type: 'string', defaultTo: 'medium', search: true } // For multi-filter tests
    },
    relationships: {
      project: { belongsTo: 'projects' }
    },
    tableName: `${tablePrefix}_items`
  });
  await api.resources.items.createKnexTable();

  return api;
}

/**
 * Creates an API with custom idProperty for all resources to test idProperty functionality
 * Uses 'custom_id_' prefix for all tables to avoid conflicts
 */
export async function createCustomIdPropertyApi(knex, pluginOptions = {}) {
  const apiName = pluginOptions.apiName || `custom-id-test-api`;
  const tablePrefix = pluginOptions.tablePrefix || 'custom_id';
  const api = new Api({
    name: apiName,
    version: '1.0.0',
    log: { level: process.env.LOG_LEVEL || 'info' }
  });

  const restApiOptions = {
    simplifiedApi: false,
    simplifiedTransport: false,
    returnRecordApi: {
      post: 'full',
      put: 'full',
      patch: 'full'
    },
    returnRecordTransport: {
      post: 'full',
      put: 'full',
      patch: 'full'
    },
    sortableFields: ['country_id', 'publisher_id', 'author_id', 'book_id', 'title', 'name', 'code'],
    ...pluginOptions['rest-api']  // Merge any custom options for rest-api plugin
  };

  await api.use(RestApiPlugin, restApiOptions);
  await api.use(RestApiKnexPlugin, { knex });

  // Countries table with custom idProperty
  await api.addResource('countries', {
    schema: {
      // NO id: { type: 'id' } - this is key!
      name: { type: 'string', required: true, max: 100, search: true },
      code: { type: 'string', max: 2, unique: true }
    },
    relationships: {
      publishers: { hasMany: 'publishers', foreignKey: 'country_id' },
      books: { hasMany: 'books', foreignKey: 'country_id' }
    },
    tableName: `${tablePrefix}_countries`,
    idProperty: 'country_id'  // Custom ID property
  });
  await api.resources.countries.createKnexTable();

  // Publishers table with custom idProperty
  await api.addResource('publishers', {
    schema: {
      name: { type: 'string', required: true, max: 200 },
      country_id: { type: 'number', nullable: true, belongsTo: 'countries', as: 'country' }
    },
    relationships: {
      books: { hasMany: 'books', foreignKey: 'publisher_id' },
      reviews: { 
        hasMany: 'reviews', 
        via: 'reviewable'
      }
    },
    tableName: `${tablePrefix}_publishers`,
    idProperty: 'publisher_id'
  });
  await api.resources.publishers.createKnexTable();

  // Authors table with custom idProperty
  await api.addResource('authors', {
    schema: {
      name: { type: 'string', required: true, max: 200 },
      biography: { type: 'string', max: 5000 },
      country_id: { type: 'number', nullable: true, belongsTo: 'countries', as: 'country' }
    },
    relationships: {
      books: { hasMany: 'books', through: 'book_authors', foreignKey: 'author_id', otherKey: 'book_id' },
      reviews: { 
        hasMany: 'reviews', 
        via: 'reviewable'
      }
    },
    tableName: `${tablePrefix}_authors`,
    idProperty: 'author_id'
  });
  await api.resources.authors.createKnexTable();

  // Books table with custom idProperty
  await api.addResource('books', {
    schema: {
      title: { type: 'string', required: true, max: 300, search: true },
      isbn: { type: 'string', max: 13 },
      pages: { type: 'number' },
      published_date: { type: 'date' },
      country_id: { type: 'number', required: true, belongsTo: 'countries', as: 'country', search: true },
      publisher_id: { type: 'number', nullable: true, belongsTo: 'publishers', as: 'publisher', search: true }
    },
    relationships: {
      authors: { hasMany: 'authors', through: 'book_authors', foreignKey: 'book_id', otherKey: 'author_id' },
      reviews: { 
        hasMany: 'reviews', 
        via: 'reviewable'
      }
    },
    tableName: `${tablePrefix}_books`,
    idProperty: 'book_id'
  });
  await api.resources.books.createKnexTable();

  // Book-Authors pivot table with custom idProperty
  await api.addResource('book_authors', {
    schema: {
      book_id: { type: 'number', required: true, belongsTo: 'books', as: 'book' },
      author_id: { type: 'number', required: true, belongsTo: 'authors', as: 'author' },
      contribution_type: { type: 'string', max: 50 },
      order: { type: 'number' }
    },
    tableName: `${tablePrefix}_book_authors`,
    idProperty: 'book_author_id'
  });
  await api.resources.book_authors.createKnexTable();

  // Polymorphic reviews with custom idProperty
  await api.addResource('reviews', {
    schema: {
      rating: { type: 'number', required: true, min: 1, max: 5 },
      title: { type: 'string', max: 200 },
      content: { type: 'string', required: true, max: 5000 },
      reviewer_name: { type: 'string', required: true, max: 100 },
      review_date: { type: 'dateTime', default: 'now()' },
      reviewable_type: { type: 'string', required: true, search: true },
      reviewable_id: { type: 'number', required: true },
      // Define the polymorphic field in schema
      reviewable: {
        belongsToPolymorphic: {
          types: ['books', 'authors', 'publishers'],
          typeField: 'reviewable_type',
          idField: 'reviewable_id'
        },
        as: 'reviewable'
      }
    },
    relationships: {},
    tableName: `${tablePrefix}_reviews`,
    idProperty: 'review_id'
  });
  await api.resources.reviews.createKnexTable();

  return api;
}

/**
 * Creates an API configuration for multi-field cursor pagination testing
 * Uses 'cursor_' prefix for all tables to avoid conflicts
 */
export async function createCursorPaginationApi(knex) {
  const api = new Api({
    name: 'cursor-pagination-test-api',
    version: '1.0.0'
  });

  const restApiOptions = {
    simplified: false,
    responseFormat: {
      post: 'full',
      put: 'full',
      patch: 'minimal'
    },
    sortableFields: ['id', 'name', 'category', 'brand', 'price', 'sku', 'created_at', 'code', 'status', 'type'],
    queryDefaultLimit: 20,
    queryMaxLimit: 100,
    publicBaseUrl: 'https://api.example.com/v1'
  };
  
  await api.use(RestApiPlugin, restApiOptions);
  await api.use(RestApiKnexPlugin, { knex });

  // Create products table with fields suitable for multi-field sorting
  await api.addResource('products', {
    schema: {
      id: { type: 'id' },
      name: { type: 'string', required: true, max: 200, search: true },
      category: { type: 'string', required: true, max: 100, search: true, indexed: true },
      brand: { type: 'string', required: true, max: 100, search: true, indexed: true },
      price: { type: 'number', required: true },
      sku: { type: 'string', required: true, max: 50, unique: true },
      status: { type: 'string', max: 50, default: 'active' },
      created_at: { type: 'dateTime', default: 'now()' }
    },
    tableName: 'cursor_products'
  });
  await api.resources.products.createKnexTable();

  // Create items table with custom ID property
  await api.addResource('items', {
    schema: {
      item_id: { type: 'id' },
      code: { type: 'string', required: true, max: 10, unique: true },
      name: { type: 'string', required: true, max: 200 },
      category: { type: 'string', required: true, max: 100 },
      type: { type: 'string', required: true, max: 50 }
    },
    idProperty: 'item_id',
    tableName: 'cursor_items'
  });
  await api.resources.items.createKnexTable();

  return api;
}

/**
 * Creates an API configuration for testing virtual fields validation
 */
export async function createVirtualFieldsApi(knex, pluginOptions = {}) {
  const apiName = pluginOptions.apiName || 'virtual-fields-test-api';
  const api = new Api({
    name: apiName,
    version: '1.0.0',
    log: { level: process.env.LOG_LEVEL || 'info' }
  });

  const restApiOptions = {
    simplifiedApi: false,
    simplifiedTransport: false,
    returnRecordApi: {
      post: true,
      put: false,
      patch: false
    },
    returnRecordTransport: {
      post: 'full',
      put: 'no',
      patch: 'minimal'
    },
    ...pluginOptions['rest-api']
  };

  await api.use(RestApiPlugin, restApiOptions);
  await api.use(RestApiKnexPlugin, { knex });

  // Add a test resource with virtual fields
  await api.addResource('users', {
    schema: {
      // Regular fields
      username: { type: 'string', required: true },
      email: { type: 'string', required: true },
      age: { type: 'number' },
      
      // Virtual fields with validation rules
      password: { type: 'string', virtual: true, minLength: 8 },
      passwordConfirmation: { type: 'string', virtual: true, minLength: 8 },
      termsAccepted: { type: 'boolean', virtual: true, required: true },
      captchaScore: { type: 'number', virtual: true, min: 0, max: 1 },
      tags: { type: 'array', virtual: true },
      metadata: { type: 'object', virtual: true }
    },
    tableName: 'virtual_users'
  });
  
  await api.resources.users.createKnexTable();

  return api;
}