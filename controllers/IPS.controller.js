const IPSService = require('../services/IPS.service');

exports.convertIPS = async (req, res) => {
  try {
    const result = await IPSService.convertIPS(req.body);
    res.status(200).json({
      message: '成功轉換 IPS 資料！',
      converterResponse: result
    });
  } catch (error) {
    console.error('IPS 轉換失敗:', error);
    res.status(500).json({
      message: 'IPS 轉換失敗',
      error: error.response ? error.response.data : { message: error.message }
    });
  }
};
