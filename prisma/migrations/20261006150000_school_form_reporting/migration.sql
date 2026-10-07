/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
CREATE TYPE "LearnerSex" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "ObservedValueRating" AS ENUM ('AO', 'SO', 'RO', 'NO');
CREATE TYPE "SchoolReportKind" AS ENUM ('SF2', 'SF9', 'SF5');
CREATE TYPE "SchoolReportStatus" AS ENUM ('DRAFT', 'FINALIZED', 'LOCKED');

ALTER TABLE "School" ADD COLUMN "schoolIdNumber" TEXT, ADD COLUMN "region" TEXT, ADD COLUMN "division" TEXT, ADD COLUMN "district" TEXT, ADD COLUMN "address" TEXT, ADD COLUMN "schoolHeadName" TEXT;
ALTER TABLE "Student" ADD COLUMN "lrn" TEXT, ADD COLUMN "birthDate" DATE, ADD COLUMN "sex" "LearnerSex";

CREATE TABLE "ObservedValue" ("id" TEXT NOT NULL, "quarter" INTEGER NOT NULL, "coreValue" TEXT NOT NULL, "rating" "ObservedValueRating" NOT NULL, "studentId" TEXT NOT NULL, "classroomId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ObservedValue_pkey" PRIMARY KEY ("id"));
CREATE TABLE "SchoolReport" ("id" TEXT NOT NULL, "reportKey" TEXT NOT NULL, "kind" "SchoolReportKind" NOT NULL, "status" "SchoolReportStatus" NOT NULL DEFAULT 'DRAFT', "periodKey" TEXT NOT NULL, "classroomId" TEXT NOT NULL, "studentId" TEXT, "schoolId" TEXT NOT NULL, "finalizedAt" TIMESTAMP(3), "lockedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SchoolReport_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ObservedValue_studentId_classroomId_quarter_coreValue_key" ON "ObservedValue"("studentId", "classroomId", "quarter", "coreValue");
CREATE INDEX "ObservedValue_classroomId_quarter_idx" ON "ObservedValue"("classroomId", "quarter");
CREATE UNIQUE INDEX "SchoolReport_reportKey_key" ON "SchoolReport"("reportKey");
CREATE INDEX "SchoolReport_classroomId_kind_periodKey_idx" ON "SchoolReport"("classroomId", "kind", "periodKey");
CREATE INDEX "SchoolReport_studentId_idx" ON "SchoolReport"("studentId");
ALTER TABLE "ObservedValue" ADD CONSTRAINT "ObservedValue_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservedValue" ADD CONSTRAINT "ObservedValue_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolReport" ADD CONSTRAINT "SchoolReport_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolReport" ADD CONSTRAINT "SchoolReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolReport" ADD CONSTRAINT "SchoolReport_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
