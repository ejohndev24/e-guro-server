/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
CREATE TABLE "ClassGroup" (
  "id" TEXT NOT NULL,
  "gradeLevel" INTEGER NOT NULL,
  "section" TEXT NOT NULL,
  "schoolYear" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "educationLevel" "EducationLevel" NOT NULL,
  "isAdvisory" BOOLEAN NOT NULL DEFAULT false,
  "teacherId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupMembership" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Classroom" ADD COLUMN "groupId" TEXT;

CREATE UNIQUE INDEX "ClassGroup_teacherId_gradeLevel_section_schoolYear_term_key" ON "ClassGroup"("teacherId", "gradeLevel", "section", "schoolYear", "term");
CREATE INDEX "ClassGroup_schoolId_idx" ON "ClassGroup"("schoolId");
CREATE UNIQUE INDEX "GroupMembership_groupId_studentId_key" ON "GroupMembership"("groupId", "studentId");
CREATE INDEX "GroupMembership_studentId_idx" ON "GroupMembership"("studentId");
CREATE INDEX "Classroom_groupId_idx" ON "Classroom"("groupId");

ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ClassGroup" ("id", "gradeLevel", "section", "schoolYear", "term", "educationLevel", "isAdvisory", "teacherId", "schoolId", "createdAt", "updatedAt")
SELECT
  'grp_' || md5("teacherId" || '|' || "gradeLevel"::text || '|' || lower(trim("section")) || '|' || lower(trim("schoolYear")) || '|' || lower(trim("term"))),
  "gradeLevel", MIN("section"), "schoolYear", "term", (array_agg("educationLevel"))[1], bool_or("isAdvisory"), "teacherId", "schoolId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Classroom"
GROUP BY "teacherId", "schoolId", "gradeLevel", lower(trim("section")), "schoolYear", "term";

UPDATE "Classroom" AS classroom
SET "groupId" = class_group."id"
FROM "ClassGroup" AS class_group
WHERE class_group."teacherId" = classroom."teacherId"
  AND class_group."gradeLevel" = classroom."gradeLevel"
  AND lower(trim(class_group."section")) = lower(trim(classroom."section"))
  AND class_group."schoolYear" = classroom."schoolYear"
  AND class_group."term" = classroom."term";

INSERT INTO "GroupMembership" ("id", "groupId", "studentId", "joinedAt")
SELECT 'mem_' || md5(classroom."groupId" || '|' || enrollment."studentId"), classroom."groupId", enrollment."studentId", MIN(enrollment."enrolledAt")
FROM "Enrollment" AS enrollment
JOIN "Classroom" AS classroom ON classroom."id" = enrollment."classroomId"
WHERE classroom."groupId" IS NOT NULL
GROUP BY classroom."groupId", enrollment."studentId";
