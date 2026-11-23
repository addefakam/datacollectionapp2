import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { normalizeInstitutionTypes } from '@/lib/location-data';
import { parseSexCounts } from '@/lib/sex-counts';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'Only Excel files (.xlsx, .xls) are accepted' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    // ExcelJS's typings expect its own augmented Buffer interface, so cast the Node buffer
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: 'Empty Excel file' }, { status: 400 });
    }

    // Read header row to map column indices
    const headerRow = sheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').trim().toLowerCase();
      if ((val.includes('institution') && !val.includes('type')) || (val.includes('school') && !val.includes('type')) || val.includes('maqaa mana barumsaa') || (val.includes('name') && !val.includes('owner') && !val.includes('contact') && !val.includes('surveyor'))) {
        headers.institutionName = colNumber;
      }
      if (val.includes('institution type') || val.includes('school type') || val.includes('gosa mana barumsaa') || (val.includes('type') && !val.includes('ownership'))) {
        headers.institutionType = colNumber;
      }
      if (val.includes('ownership') || val.includes('abbaa qabuu')) {
        headers.ownershipType = colNumber;
      }
      if (val.includes('sub-city') || val.includes('subcity') || val.includes('kuttaa')) {
        headers.subCity = colNumber;
      }
      if (val.includes('werreda') || val.includes('woreda') || val.includes('area') || val.includes('kebele')) {
        headers.area = colNumber;
      }
      if (val.includes('address') || val.includes('baka')) {
        headers.specificAddress = colNumber;
      }
      if (val.includes('license no') || val.includes('license number') || val.includes('lakofsaa')) {
        headers.licenseNumber = colNumber;
      }
      // Sex breakdown columns must be matched before the generic student/teacher
      // columns ("Female Students" also contains "student", "male").
      if (val.includes('female') || val.includes('dubartii')) {
        if (val.includes('teacher') || val.includes('barsiisaa')) {
          headers.femaleTeachers = colNumber;
        } else if (val.includes('student') || val.includes('barataa') || val.includes('barattii')) {
          headers.femaleStudents = colNumber;
        }
      } else if (val.includes('male') || val.includes('dhiira')) {
        if (val.includes('teacher') || val.includes('barsiisaa')) {
          headers.maleTeachers = colNumber;
        } else if (val.includes('student') || val.includes('barataa') || val.includes('barattii')) {
          headers.maleStudents = colNumber;
        }
      } else if (val.includes('student') || val.includes('barataa')) {
        headers.studentCount = colNumber;
      } else if (val.includes('teacher') || val.includes('barsiisaa')) {
        headers.teacherCount = colNumber;
      }
      if (val.includes('classroom') || val.includes('kutaa')) {
        headers.classroomCount = colNumber;
      }
      if (/(^|\W)librar/.test(val)) {
        headers.hasLibrary = colNumber;
      }
      if (/(^|\W)lab(oratory)?(\W|$)/.test(val)) {
        headers.hasLaboratory = colNumber;
      }
      if (val.includes('computer') || val.includes('ict')) {
        headers.hasComputerLab = colNumber;
      }
      if (val.includes('feeding') || val.includes('soorataa')) {
        headers.hasFeedingProgram = colNumber;
      }
      if (val.includes('contact person') || val.includes('quunnamtii') && !val.includes('bilbila')) {
        headers.contactName = colNumber;
      }
      if (val.includes('phone') || val.includes('bilbila')) {
        headers.contactPhone = colNumber;
      }
    });

    // Validate required headers (licenseNumber is optional)
    const requiredHeaders = ['institutionName', 'institutionType', 'ownershipType', 'subCity', 'area', 'specificAddress', 'studentCount', 'teacherCount', 'classroomCount', 'contactName', 'contactPhone'];
    const missing = requiredHeaders.filter(h => !headers[h]);
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Missing columns in Excel: ${missing.join(', ')}. Download the template first.`,
        missing
      }, { status: 400 });
    }

    const phoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
    // Yes/No cell values: Yes, Y, True, 1, Eyee
    const parseYesNo = (v: string) => /^(yes|y|true|1|eyee)$/i.test(v.trim());
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Read data rows (skip header)
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const getCell = (col: number) => {
        const cell = row.getCell(col);
        return cell.value ? String(cell.value).trim() : '';
      };

      const institutionName = getCell(headers.institutionName!);
      if (!institutionName) continue; // skip empty rows

      const institutionType = getCell(headers.institutionType!);
      const ownershipType = getCell(headers.ownershipType!);
      const subCity = getCell(headers.subCity!);
      const area = getCell(headers.area!);
      const specificAddress = getCell(headers.specificAddress!);
      const licenseNumber = headers.licenseNumber ? getCell(headers.licenseNumber) : "";
      const studentCount = getCell(headers.studentCount!);
      const maleStudents = headers.maleStudents ? getCell(headers.maleStudents) : '';
      const femaleStudents = headers.femaleStudents ? getCell(headers.femaleStudents) : '';
      const teacherCount = getCell(headers.teacherCount!);
      const maleTeachers = headers.maleTeachers ? getCell(headers.maleTeachers) : '';
      const femaleTeachers = headers.femaleTeachers ? getCell(headers.femaleTeachers) : '';
      const classroomCount = getCell(headers.classroomCount!);
      const hasLibrary = headers.hasLibrary ? parseYesNo(getCell(headers.hasLibrary)) : false;
      const hasLaboratory = headers.hasLaboratory ? parseYesNo(getCell(headers.hasLaboratory)) : false;
      const hasComputerLab = headers.hasComputerLab ? parseYesNo(getCell(headers.hasComputerLab)) : false;
      const hasFeedingProgram = headers.hasFeedingProgram ? parseYesNo(getCell(headers.hasFeedingProgram)) : false;
      const contactName = getCell(headers.contactName!);
      const contactPhone = getCell(headers.contactPhone!);

      // Validate
      if (!institutionType || !ownershipType || !subCity || !area || !specificAddress || !studentCount || !teacherCount || !classroomCount || !contactName || !contactPhone) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Missing required fields`);
        continue;
      }

      const students = Number(studentCount);
      if (!Number.isFinite(students) || !Number.isInteger(students) || students < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid student count "${studentCount}"`);
        continue;
      }
      const teachers = Number(teacherCount);
      if (!Number.isFinite(teachers) || !Number.isInteger(teachers) || teachers < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid teacher count "${teacherCount}"`);
        continue;
      }
      const classrooms = Number(classroomCount);
      if (!Number.isFinite(classrooms) || !Number.isInteger(classrooms) || classrooms < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid classroom count "${classroomCount}"`);
        continue;
      }

      const sexStudents = parseSexCounts(maleStudents, femaleStudents, students, 'Student Count');
      if (!sexStudents.ok) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: ${sexStudents.error}`);
        continue;
      }
      const sexTeachers = parseSexCounts(maleTeachers, femaleTeachers, teachers, 'Teacher Count');
      if (!sexTeachers.ok) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: ${sexTeachers.error}`);
        continue;
      }

      const phoneClean = contactPhone.replace(/[\s-]/g, '');
      if (!phoneRegex.test(phoneClean)) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid phone number "${contactPhone}"`);
        continue;
      }

      try {
        await db.educationCenter.create({
          data: {
            institutionName,
            // cell may list several types, e.g. "Kindergarten, Primary School (1-4)"
            institutionType: normalizeInstitutionTypes(institutionType),
            ownershipType,
            subCity,
            area,
            specificAddress,
            licenseNumber: licenseNumber || null,
            studentCount: Math.round(students),
            maleStudents: sexStudents.male,
            femaleStudents: sexStudents.female,
            teacherCount: Math.round(teachers),
            maleTeachers: sexTeachers.male,
            femaleTeachers: sexTeachers.female,
            classroomCount: Math.round(classrooms),
            hasLibrary,
            hasLaboratory,
            hasComputerLab,
            hasFeedingProgram,
            contactName,
            contactPhone,
            surveyorName: 'Admin Import',
          },
        });
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Database error`);
      }
    }

    return NextResponse.json({
      message: `Import complete: ${results.success} succeeded, ${results.failed} failed`,
      ...results,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to process Excel file', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
