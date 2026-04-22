const { sendResponse } = require('../utils/response');

const getTemplateById = async (req, res) => {
  const { id } = req.params;

  // This endpoint can later be switched to DB-backed templates.
  const template = {
    id,
    code: 'GMP-WAREHOUSE-001',
    name: 'Warehouse GMP Compliance Audit',
    version: 3,
    status: 'ACTIVE',
    metadata: {
      domain: 'quality',
      industry: 'pharma',
      language: 'en',
      timezone: 'UTC',
      created_by: 'system',
      tags: ['gmp', 'warehouse', 'cold-chain']
    },
    scoring: {
      enabled: true,
      max_score: 100,
      pass_threshold: 85
    },
    sections: [
      {
        id: 'SEC-GEN',
        title: 'General Information',
        order: 1
      },
      {
        id: 'SEC-TEMP',
        title: 'Temperature Control',
        order: 2
      },
      {
        id: 'SEC-HOUSE',
        title: 'Housekeeping',
        order: 3
      }
    ],
    questions: [
      {
        id: 'Q-001',
        section_id: 'SEC-GEN',
        order: 1,
        question_text: 'Inspector full name',
        answer_type: 'TEXT',
        required: true,
        parent_question_id: null,
        prerequisite_condition: null,
        validation: {
          min_length: 2,
          max_length: 120
        }
      },
      {
        id: 'Q-002',
        section_id: 'SEC-GEN',
        order: 2,
        question_text: 'Date of inspection',
        answer_type: 'DATE',
        required: true,
        parent_question_id: null,
        prerequisite_condition: null
      },
      {
        id: 'Q-003',
        section_id: 'SEC-TEMP',
        order: 3,
        question_text: 'Is there a cold room on site?',
        answer_type: 'BOOLEAN',
        required: true,
        parent_question_id: null,
        prerequisite_condition: null
      },
      {
        id: 'Q-004',
        section_id: 'SEC-TEMP',
        order: 4,
        question_text: 'Cold room temperature (in Celsius)',
        answer_type: 'NUMBER',
        required: true,
        parent_question_id: 'Q-003',
        prerequisite_condition: {
          operator: 'EQUALS',
          value: true
        },
        validation: {
          min: -30,
          max: 12
        }
      },
      {
        id: 'Q-005',
        section_id: 'SEC-TEMP',
        order: 5,
        question_text: 'Attach a photo of the thermometer display',
        answer_type: 'PHOTO',
        required: false,
        parent_question_id: 'Q-003',
        prerequisite_condition: {
          operator: 'EQUALS',
          value: true
        },
        media: {
          min_photos: 1,
          max_photos: 3
        }
      },
      {
        id: 'Q-006',
        section_id: 'SEC-HOUSE',
        order: 6,
        question_text: 'Are housekeeping standards compliant?',
        answer_type: 'BOOLEAN',
        required: true,
        parent_question_id: null,
        prerequisite_condition: null
      },
      {
        id: 'Q-007',
        section_id: 'SEC-HOUSE',
        order: 7,
        question_text: 'Describe the non-conformity observed',
        answer_type: 'TEXT',
        required: true,
        parent_question_id: 'Q-006',
        prerequisite_condition: {
          operator: 'EQUALS',
          value: false
        },
        validation: {
          min_length: 10,
          max_length: 1000
        }
      }
    ],
    updated_at: '2026-04-22T00:00:00.000Z'
  };

  return sendResponse(res, 200, true, template, 'Template fetched successfully.');
};

module.exports = {
  getTemplateById
};
