---
layout: default
---

# Build REST APIs in Minutes, Not Days

JSON REST API is a lightweight, plugin-based framework that makes building REST APIs incredibly simple. With automatic validation, smart relationships, and native JSON:API support, you can focus on your business logic instead of boilerplate.

<div style="display: flex; gap: 24px; margin: 32px 0; align-items: flex-start;">
  <div style="display: flex; gap: 16px; flex-wrap: wrap;">
    <a href="{{ '/QUICKSTART' | relative_url }}" class="button">Get Started</a>
    <a href="{{ '/GUIDE' | relative_url }}" class="button secondary">Read the Guide</a>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px 20px; font-style: italic; color: #555; flex: 1; margin-left: 24px;">
    A heartfelt thank you to Dario and Daniela Amodei and the entire Anthropic team for creating transformative AI technology that opens endless possibilities for developers worldwide. Your vision, combined with incredibly accessible pricing, has democratized access to cutting-edge AI and empowered countless innovators to build the future. (No, we weren't asked nor paid in any way for this message - we're just genuinely grateful!)
  </div>
</div>

## Why JSON REST API?

<div class="feature-grid">
  <div class="feature-card">
    <h3>🚀 Zero Configuration</h3>
    <p>Get a fully functional API running in under 5 minutes. No complex setup or configuration files needed.</p>
  </div>
  
  <div class="feature-card">
    <h3>🔌 Plugin Architecture</h3>
    <p>Extend your API with powerful plugins. Authentication, validation, CORS, and more - just plug and play.</p>
  </div>
  
  <div class="feature-card">
    <h3>🔗 Smart Relationships</h3>
    <p>Define relationships once and get automatic joins, nested queries, and eager loading out of the box.</p>
  </div>
  
  <div class="feature-card">
    <h3>✅ Built-in Validation</h3>
    <p>Schema-based validation ensures your data is always clean. No more manual validation code.</p>
  </div>
  
  <div class="feature-card">
    <h3>📦 Multiple Storage Options</h3>
    <p>Start with in-memory storage for development, switch to MySQL for production. Same API, no code changes.</p>
  </div>
  
  <div class="feature-card">
    <h3>🎯 JSON:API Compliant</h3>
    <p>Follow industry standards with native JSON:API support. Compatible with any JSON:API client library.</p>
  </div>
  
  <!--
  <div class="feature-card">
    <h3>🌐 Microservices Ready</h3>
    <p>Build distributed systems with native microservices support. Multiple transports, service discovery, and more.</p>
  </div>
  
  <div class="feature-card">
    <h3>🎭 CQRS Support</h3>
    <p>Implement Command Query Responsibility Segregation with event sourcing, projections, and sagas.</p>
  </div>
  
  <div class="feature-card">
    <h3>🔄 API Gateway</h3>
    <p>Transform into an API gateway to orchestrate external services with circuit breakers and saga support.</p>
  </div>
  -->
</div>

## Quick Example

```javascript
import { RestApiPlugin, RestApiKnexPlugin, ExpressPlugin } from 'json-rest-api';
import { Api } from 'hooked-api';
import knexLib from 'knex';
import express from 'express'; // npm install Express

// Create a Knex instance connected to SQLite in-memory database
const knex = knexLib({
  client: 'better-sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true
});

// Create API instance
const api = new Api({ name: 'book-catalog-api', version: '1.0.0' });

// Install plugins
await api.use(RestApiPlugin, { publicBaseUrl: '/api/1.0' }); // Basic REST plugin
await api.use(RestApiKnexPlugin, { knex }); // Knex connector
await api.use(ExpressPlugin, {  mountPath: '/api' }); // Express plugin

// Countries table
await api.addResource('countries', {
  schema: {
    name: { type: 'string', required: true, max: 100, search: true },
    code: { type: 'string', max: 2, unique: true, search: true }, // ISO country code
  }
});
await api.resources.countries.createKnexTable()

// Create the express server and add the API's routes 
const app = express();
app.use(api.http.express.router);
app.use(api.http.express.notFoundRouter);

app.listen(3000, () => {
  console.log('Express server started on port 3000. API available at http://localhost:3000/api');
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1)
});
```

That's it! You now have a fully functional REST API with:

- `GET /api/countries` - List all countrie
- `GET /api/countries/:id` - Get a specific country
- `POST /api/countries` - Create a new country
- `PATCH /api/countries/:id` - Update a country
- `DELETE /api/countries/:id` - Delete a country

## Try It Out

```bash
# Create a country
curl -i -X POST http://localhost:3000/api/countries \
  -H "Content-Type: application/json" \
  -d '{"data":{"type": "countries", "attributes": { "name": "United Kingdom", "code": "UK" }}}'

# List all countries
curl -i http://localhost:3000/api/countries

# Get a specific country
curl -i http://localhost:3000/api/countries/1

# Update a country
curl -i -X PATCH http://localhost:3000/api/countries/1 \
  -H "Content-Type: application/json" \
  -d '{"data":{"id":"1", "type": "countries", "attributes": { "name": "England", "code": "UK" }}}'

# Delete a country
curl -i -X DELETE http://localhost:3000/api/countries/1
```

## Ready to Start?

<div style="margin: 32px 0;">
  <a href="{{ '/QUICKSTART' | relative_url }}" class="button">Get Started in 5 Minutes →</a>
</div>

## Installation

```bash
npm install json-rest-api
```

## Learn More

- [Complete Guide]({{ '/GUIDE' | relative_url }}) - Everything you need to know
- [API Reference]({{ '/API' | relative_url }}) - Detailed API documentation
- [Tutorial]({{ '/ONBOARDING' | relative_url }}) - Step-by-step walkthrough
- [GitHub](https://github.com/mobily-enterprises/json-rest-api) - Source code and issues
