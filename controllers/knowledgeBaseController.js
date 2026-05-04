const { sendResponse } = require('../utils/response');

const getKnowledgeBaseArticles = async (req, res) => {
  const articles = [
    {
      id: 1,
      category: 'General FAQ',
      title: 'How do I create an audit template?',
      snippet: 'Use the Template Builder to add nodes and edges, then save.'
    },
    {
      id: 2,
      category: 'Mobile Audits',
      title: 'How does offline sync work?',
      snippet: 'Complete audits offline and sync when connectivity returns.'
    },
    {
      id: 3,
      category: 'CAPA Board',
      title: 'How do I update a CAPA status?',
      snippet: 'Open a CAPA item and move it through its status lifecycle.'
    }
  ];

  return sendResponse(res, 200, true, articles, 'Knowledge base articles fetched successfully.');
};

module.exports = {
  getKnowledgeBaseArticles
};
