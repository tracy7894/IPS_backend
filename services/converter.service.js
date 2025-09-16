const axios = require('axios');

const CONVERTER_API_URL = process.env.CONVERTER_API_URL;

exports.sendToConverter = async (data, rulesYml) => {
  const requestBody = {
    source: {
      type: 'raw',
      raw: {
        data,
        rulesYml
      }
    }
  };

  console.log('傳送給 Converter 的完整請求 Body:', JSON.stringify(requestBody, null, 2));

  const response = await axios.post(CONVERTER_API_URL, requestBody, {
    headers: { 'Content-Type': 'application/json' }
  });

  return response.data;
};
