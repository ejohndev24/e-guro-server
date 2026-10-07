/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
-- School-owned student records and flexible, versioned grading schemes.
CREATE TYPE "EducationLevel" AS ENUM ('KINDERGARTEN', 'ELEMENTARY', 'JUNIOR_HIGH', 'SENIOR_HIGH', 'COLLEGE', 'CUSTOM');
CREATE TYPE "GradingSchemeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

ALTER TABLE "Student" ADD COLUMN "schoolId" TEXT;

-- Existing students inherit the school of one of their current classes.
UPDATE "Student" student
SET "schoolId" = source."schoolId"
FROM (
  SELECT DISTINCT ON (enrollment."studentId") enrollment."studentId", classroom."schoolId"
  FROM "Enrollment" enrollment
  JOIN "Classroom" classroom ON classroom."id" = enrollment."classroomId"
  ORDER BY enrollment."studentId", enrollment."enrolledAt"
) source
WHERE student."id" = source."studentId";

-- A fresh/partially seeded database may have unattached students and one school.
UPDATE "Student"
SET "schoolId" = (SELECT "id" FROM "School" ORDER BY "createdAt" LIMIT 1)
WHERE "schoolId" IS NULL;

ALTER TABLE "Student" ALTER COLUMN "schoolId" SET NOT NULL;
DROP INDEX "Student_studentNo_key";
DROP INDEX "Student_lastName_firstName_idx";
CREATE UNIQUE INDEX "Student_schoolId_studentNo_key" ON "Student"("schoolId", "studentNo");
CREATE INDEX "Student_schoolId_lastName_firstName_idx" ON "Student"("schoolId", "lastName", "firstName");
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GradingScheme" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "educationLevel" "EducationLevel" NOT NULL,
  "status" "GradingSchemeStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradingScheme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GradeCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "weight" DECIMAL(5,2) NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "schemeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradeCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Classroom" ADD COLUMN "gradingSchemeId" TEXT;

CREATE TABLE "Assessment" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "maxScore" DECIMAL(8,2) NOT NULL,
  "quarter" INTEGER NOT NULL,
  "categoryId" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentScore" (
  "id" TEXT NOT NULL,
  "score" DECIMAL(8,2),
  "assessmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GradingScheme_schoolId_name_version_key" ON "GradingScheme"("schoolId", "name", "version");
CREATE INDEX "GradingScheme_schoolId_status_idx" ON "GradingScheme"("schoolId", "status");
CREATE UNIQUE INDEX "GradeCategory_schemeId_name_key" ON "GradeCategory"("schemeId", "name");
CREATE INDEX "GradeCategory_schemeId_position_idx" ON "GradeCategory"("schemeId", "position");
CREATE INDEX "Classroom_gradingSchemeId_idx" ON "Classroom"("gradingSchemeId");
CREATE INDEX "Assessment_classroomId_quarter_idx" ON "Assessment"("classroomId", "quarter");
CREATE INDEX "Assessment_categoryId_idx" ON "Assessment"("categoryId");
CREATE UNIQUE INDEX "StudentScore_assessmentId_studentId_key" ON "StudentScore"("assessmentId", "studentId");
CREATE INDEX "StudentScore_studentId_idx" ON "StudentScore"("studentId");

ALTER TABLE "GradingScheme" ADD CONSTRAINT "GradingScheme_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GradeCategory" ADD CONSTRAINT "GradeCategory_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "GradingScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_gradingSchemeId_fkey" FOREIGN KEY ("gradingSchemeId") REFERENCES "GradingScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GradeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentScore" ADD CONSTRAINT "StudentScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentScore" ADD CONSTRAINT "StudentScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
