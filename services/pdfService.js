const PDFDocument = require('pdfkit');

/**
 * Generates a professionally formatted lesson plan PDF based on Document data.
 * Adheres to standard CBC template format.
 * @param {Object} docData - Document model instance / data object
 * @returns {Promise<Buffer>} - Resolves to PDF binary buffer
 */
function generateLessonPlanPDF(docData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 36, bottom: 36, left: 36, right: 36 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const startX = 36;
      let currentY = 36;

      // Document Title Header
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#4f46e5').text('OFFICIAL LESSON PLAN', startX, currentY, { align: 'center' });
      currentY += 24;

      // ────────────────────────────────────────────────────────────────────────
      // 1. Header Grid Row (Learning Area, Grade, Date, Time, Roll)
      // ────────────────────────────────────────────────────────────────────────
      const gridHeight = 40;
      doc.rect(startX, currentY, 523, gridHeight).strokeColor('#cbd5e1').lineWidth(1).stroke();

      const colWidths = [133, 80, 100, 110, 100]; // sum = 523
      const xPositions = [startX];
      for (let i = 0; i < colWidths.length; i++) {
        xPositions.push(xPositions[i] + colWidths[i]);
      }

      // Horizontal line splitter
      doc.moveTo(startX, currentY + 18).lineTo(startX + 523, currentY + 18).strokeColor('#cbd5e1').stroke();

      // Vertical line markers
      for (let i = 1; i < xPositions.length - 1; i++) {
        doc.moveTo(xPositions[i], currentY).lineTo(xPositions[i], currentY + gridHeight).strokeColor('#cbd5e1').stroke();
      }

      // Draw Grid labels and values
      const drawCell = (colIdx, label, value) => {
        const x = xPositions[colIdx] + 6;
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#64748b').text(label.toUpperCase(), x, currentY + 4, { width: colWidths[colIdx] - 12 });
        doc.fontSize(9).font('Helvetica').fillColor('#1e293b').text(value || '—', x, currentY + 22, { width: colWidths[colIdx] - 12 });
      };

      drawCell(0, 'Learning Area', 'Mathematics');
      drawCell(1, 'Grade', docData.grade);
      drawCell(2, 'Date', docData.date);
      drawCell(3, 'Time', docData.time);
      drawCell(4, 'Roll', docData.roll);

      currentY += gridHeight + 15;

      // Helper to render section divider headers
      const renderSectionHeader = (title) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = 36;
        }
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#4338ca').text(title.toUpperCase(), startX, currentY);
        currentY += 12;
        doc.moveTo(startX, currentY).lineTo(startX + 523, currentY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        currentY += 8;
      };

      // Helper to render label-value pairs
      const renderContentItem = (label, value) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = 36;
        }
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1e293b').text(`${label}: `, startX, currentY, { continued: true });
        
        let textVal = '';
        if (Array.isArray(value)) {
          textVal = value.filter(v => v && v.trim() !== '').join(', ');
        } else {
          textVal = value || '—';
        }

        doc.font('Helvetica').fillColor('#475569').text(textVal, { width: 523 });
        currentY = doc.y + 6;
      };

      // ────────────────────────────────────────────────────────────────────────
      // 2. Curriculum Info Section
      // ────────────────────────────────────────────────────────────────────────
      renderSectionHeader('Curriculum Information');
      renderContentItem('Strand', docData.strand);
      renderContentItem('Sub-strand', docData.subStrand);
      
      const outcomes = docData.lessonPlan?.objectives || docData.objectives || [];
      renderContentItem('Specific Learning Outcomes', outcomes);

      const keyInq = docData.keyInquiryQuestions || ['How do we apply place value principles to write large numbers?'];
      renderContentItem('Key Inquiry Question(s)', keyInq);

      // ────────────────────────────────────────────────────────────────────────
      // 3. Learning Organization Section
      // ────────────────────────────────────────────────────────────────────────
      renderSectionHeader('Learning Organization');
      const resources = docData.lessonPlan?.materials || ['Mathematics chart', 'Numbers cards', 'Pupils workbook'];
      renderContentItem('Learning Resources / Materials', resources);
      renderContentItem('Organization of Learning', 'Whole group demonstration of place value followed by pairing learners for charting activity.');

      // ────────────────────────────────────────────────────────────────────────
      // 4. Core Lesson Sections
      // ────────────────────────────────────────────────────────────────────────
      renderSectionHeader('The Core Lesson');
      
      // Introduction
      renderContentItem('Introduction', docData.lessonPlan?.introduction || 'Hook students by asking real-life application of large numbers.');

      // Lesson Presentation List
      if (currentY > 750) {
        doc.addPage();
        currentY = 36;
      }
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1e293b').text('Lesson Presentation / Development:', startX, currentY);
      currentY += 12;

      const presentationSteps = [];
      if (docData.presentation && docData.presentation.length > 0) {
        docData.presentation.forEach(sec => {
          if (sec.section) {
            presentationSteps.push(`${sec.section}:`);
          }
          if (Array.isArray(sec.points)) {
            sec.points.forEach(p => presentationSteps.push(`  • ${p}`));
          }
        });
      } else if (docData.lessonPlan?.activities) {
        presentationSteps.push(docData.lessonPlan.activities);
      }

      if (presentationSteps.length === 0) {
        presentationSteps.push('—');
      }

      presentationSteps.forEach(step => {
        if (currentY > 750) {
          doc.addPage();
          currentY = 36;
        }
        doc.fontSize(8.5).font(step.startsWith(' ') ? 'Helvetica' : 'Helvetica-Bold').fillColor('#475569').text(step, startX + 10, currentY, { width: 513 });
        currentY = doc.y + 4;
      });
      currentY += 4;

      // Evaluation
      renderContentItem('Extended Activity / Written Exercise', docData.lessonPlan?.evaluation || 'Practice worksheet numbers representation exercise.');

      // Conclusion
      renderContentItem('Conclusion / Q&A', docData.conclusion || docData.lessonPlan?.conclusion || 'Summarize place value charting steps and answer learner questions.');

      // Reflection Placeholder
      renderContentItem('Reflection', 'Teacher\'s Self-Reflection: ________________________________________________________________________________________________________________________________________________________');

      // Assessment
      const assessment = docData.assessmentMethods || ['Oral evaluation', 'Written class exercises', 'Observations'];
      renderContentItem('Assessment Methods', assessment);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateLessonPlanPDF };
