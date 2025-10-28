const axios = require('axios');
const CONVERTER_API_URL = process.env.CONVERTER_API_URL || 'http://localhost:42420/precompile'; // Adjust if needed

// Helper function for delays
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

exports.sendToConverter = async (data, rulesYml) => {
  const requestBody = {
    source: { type: 'raw', raw: { data, rulesYml } }
  };

  try {
    // 1. Initial POST to start conversion and get status links
    console.log('Sending initial request to start conversion...');
    const initialResponse = await axios.post(CONVERTER_API_URL, requestBody, {
      headers: { 'Content-Type': 'application/json' }
    });

    // Check if the API *might* sometimes return the bundle directly (unlikely but safe check)
    if (initialResponse.data && initialResponse.data.resourceType === 'Bundle') {
        console.log('Converter returned Bundle directly (synchronous?).');
        return initialResponse.data;
    }

    // Check if we got the expected queuing response
    if (!initialResponse.data || initialResponse.data.status !== 'queued' || !initialResponse.data.links?.self || !initialResponse.data.links?.bundle) {
      console.error('Converter API did not return expected queue status. Received:', initialResponse.data);
      throw new Error('Converter API did not return expected queue status.');
    }

    const statusUrl = initialResponse.data.links.self;
    const bundleUrl = initialResponse.data.links.bundle;
    const conversionId = initialResponse.data.id;
    console.log(`Conversion queued with ID: ${conversionId}. Polling status at: ${statusUrl}`);

    // 2. Poll the status URL until completed or failed
    let statusData;
    let attempts = 0;
    const maxAttempts = 10; // Max number of polling attempts
    const pollInterval = 1000; // Poll every 1 second (adjust as needed)

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Polling attempt ${attempts}/${maxAttempts}...`);
      try {
        const statusResponse = await axios.get(statusUrl);
        statusData = statusResponse.data;

        console.log(`Current status: ${statusData.status}`);

        if (statusData.status === 'completed') {
          console.log('Conversion completed! Fetching bundle...');
          // 3. Fetch the final bundle
          const bundleResponse = await axios.get(bundleUrl);

          // Validate the final bundle
          if (bundleResponse.data && bundleResponse.data.resourceType === 'Bundle' && Array.isArray(bundleResponse.data.entry)) {
            console.log('Successfully fetched the final Bundle.');
            return bundleResponse.data;
          } else {
            console.error('Fetched result is not a valid Bundle. Received:', bundleResponse.data);
            throw new Error('Fetched result is not a valid Bundle.');
          }
        } else if (statusData.status === 'failed') {
          console.error('Conversion failed according to status API.', statusData);
          throw new Error(`Conversion failed with ID: ${conversionId}. Reason: ${statusData.error || 'Unknown'}`);
        }
        // If status is still 'queued' or 'processing', wait and poll again
      } catch (pollError) {
          console.error(`Error during polling attempt ${attempts}:`, pollError.message);
          // Decide if you want to retry on poll errors or fail immediately
          if (attempts >= maxAttempts) throw pollError; // Throw if max attempts reached
      }
       await delay(pollInterval);
    }

    // If loop finishes without completion
    console.error(`Conversion did not complete after ${maxAttempts} attempts.`);
    throw new Error(`Conversion timed out for ID: ${conversionId}`);

  } catch (error) {
    // Log detailed error information from Axios or polling logic
    console.error('Error in sendToConverter process:');
     if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
       console.error('No response received:', error.request);
     } else {
       console.error('Error message:', error.message);
     }
    // Re-throw the error
    throw new Error(`Failed during converter interaction: ${error.message}`);
  }
};