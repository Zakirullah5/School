import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { StudentFullProfile } from '../types';

export function exportAttendancePdf(
  title: string,
  subtitle: string,
  records: Array<{
    date: string;
    student_code: string;
    full_name: string;
    roll_number: string;
    class_name: string;
    status: string;
  }>
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFillColor(11, 27, 58);
  doc.rect(0, 0, 595, 76, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('ABDALI EDUCATION ACADEMY', 36, 34);
  doc.setFontSize(10);
  doc.setTextColor(217, 167, 56);
  doc.text(title, 36, 54);
  doc.setTextColor(200, 210, 230);
  doc.text(subtitle, 36, 68);

  autoTable(doc, {
    startY: 94,
    head: [['Date', 'Student ID', 'Roll No.', 'Student Name', 'Class', 'Status']],
    body: records.map((r) => [r.date, r.student_code, r.roll_number, r.full_name, r.class_name, r.status]),
    headStyles: { fillColor: [15, 37, 75], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`abdali-attendance-${Date.now()}.pdf`);
}

export function exportAttendanceExcel(
  filename: string,
  records: Array<Record<string, unknown>>
) {
  const worksheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportStudentIdCardPdf(student: StudentFullProfile['student']) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [86, 54] });
  // Card header
  doc.setFillColor(11, 27, 58);
  doc.rect(0, 0, 86, 15, 'F');
  doc.setFillColor(200, 151, 42);
  doc.rect(0, 15, 86, 1.2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text('ABDALI EDUCATION ACADEMY', 43, 6.5, { align: 'center' });
  doc.setFontSize(6);
  doc.setTextColor(217, 167, 56);
  doc.text('OFFICIAL STUDENT IDENTITY CARD', 43, 11.5, { align: 'center' });

  // Details
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text(student.full_name, 8, 23);

  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Student ID: ${student.student_code}`, 8, 28.5);
  doc.text(`Class: ${student.class_name} (${student.section})  |  Roll No: ${student.roll_number}`, 8, 33);
  doc.text(`Father: ${student.father_name}`, 8, 37.5);
  doc.text(`Guardian Contact: ${student.parent_mobile}`, 8, 42);

  doc.setDrawColor(203, 213, 225);
  doc.line(8, 45.5, 78, 45.5);
  doc.setFontSize(5.5);
  doc.text(`Admitted: ${student.admission_date}  ·  Valid Session 2026-2027`, 8, 49.5);

  doc.save(`ID-Card-${student.student_code}.pdf`);
}

export function exportAnalyticsReportPdf(
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFillColor(11, 27, 58);
  doc.rect(0, 0, 595, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text('ABDALI EDUCATION ACADEMY — ANALYTICS REPORT', 36, 32);
  doc.setFontSize(10);
  doc.setTextColor(217, 167, 56);
  doc.text(title, 36, 52);

  autoTable(doc, {
    startY: 88,
    head: [headers],
    body: rows,
    headStyles: { fillColor: [15, 37, 75], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
  });

  doc.save(`abdali-report-${Date.now()}.pdf`);
}
