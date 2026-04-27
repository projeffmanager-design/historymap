Deploying to Vercel

This project contains static assets (including `silla_genealogy.html`) and three serverless API endpoints that read from the `historyperson` MongoDB database.

Serverless functions (placed in `api-serverless/`):
- `persons.js` → /api/인물 (returns TSV)
- `spouses.js` → /api/배우자 (returns TSV)
- `parents.js` → /api/부모 (returns TSV)

Required Vercel Environment Variables
- MONGO_URI (or MONGO_IMPORT_URI) : mongodb+srv connection string for the cluster containing `historyperson` DB.
  - Example: mongodb+srv://hwangjeffeha_db_user:PASSWORD@historyperson.cowntkk.mongodb.net/

How to deploy
1. Install Vercel CLI (if you want local deploy tools):
   npm i -g vercel
2. From the repo root run:
   vercel
   (follow the prompts, set project name and link to scope)
3. Add environment variable in Vercel dashboard:
   - Key: MONGO_URI
   - Value: mongodb+srv://hwangjeffeha_db_user:YOUR_PASSWORD@historyperson.cowntkk.mongodb.net/
4. After deployment, open:
   https://<your-vercel-project>.vercel.app/silla_genealogy.html

Notes
- Serverless functions reuse a cached MongoClient to reduce cold-start overhead.
- If you need JSON endpoints instead of TSV, I can add them quickly (e.g. `/api/json/persons`).
- The current behavior returns TSV to match the page which expects TSV files like `./인물`.
