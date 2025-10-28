const IPSService = require('../services/IPS.service');

exports.convertIPS = async (req, res) => {
  try {
     console.log(">>> 即將呼叫 ipsService.convertIPS...");
    const result = await IPSService.convertIPS(req.body);
   console.log("<<< ipsService.convertIPS 執行完畢。");

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
