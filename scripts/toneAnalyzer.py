import sys
import json
from ibm_watson import ToneAnalyzerV3, ApiException
from ibm_cloud_sdk_core.authenticators import IAMAuthenticator

try:
    authenticator = IAMAuthenticator("BrheobpBxkiacKw6c7ARzDjZQtwayYv_e-pReMrl6XMB")
    tone_analyzer = ToneAnalyzerV3(
        version='2017-09-21',
        authenticator=authenticator
    )

    tone_analyzer.set_service_url('https://api.eu-de.tone-analyzer.watson.cloud.ibm.com/instances/491ccc39-3add-4be1-8cc1-19a452f755ff')

    text = str(sys.argv[1])
    
    tone_analysis = tone_analyzer.tone(
        { 'text': text },
        content_type='application/json'
    ).get_result()

    print(json.dumps(tone_analysis))
except ApiException as exception:
    print("Method failed with status code " + str(exception.code) + " : " + exception.message)
    pass