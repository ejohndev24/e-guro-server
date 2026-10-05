# E-Guro Server

NestJS GraphQL API for the E-Guro teacher mobile app and administration portal.

## Local setup

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run start:dev
```

Endpoints:

- Health: `http://localhost:4000/health`
- GraphQL: `http://localhost:4000/graphql`

Development accounts created by the seed:

```text
Admin: admin@teacherhub.local / Admin123!
School admin: school.admin@school.edu / SchoolAdmin123!
Teacher: alex.rivera@school.edu / Teacher123!
```

The development seed clears application tables. Never run it in production.

School administrators are scoped to one school. They can manage that school's student roster, enroll students in subject classes, invite teachers, and create versioned grading templates whose category weights must total exactly 100%. Teachers add assessments (including recitation, projects, labs, or exams) and encode scores in the mobile app using the template assigned to their class.

## Production database

```bash
npx prisma migrate deploy
npm run db:bootstrap-admin
```

Configure `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, CORS, SMTP, and the bootstrap administrator values using `.env.example`. Remove the bootstrap password after creating the production administrator.
