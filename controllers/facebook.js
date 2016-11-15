var config = require('config');
var crypto = require('crypto');
var request = require('request');

var conclyLog = require('./concly.logger.js');

// Facebook parameters
const FB_APP_SECRET = config.get('facebook.appSecret');
const FB_APP_ID = config.get('facebook.appId');
const FB_VERIFY_TOKEN = config.get('facebook.validationToken');
const FB_PAGE_TOKEN =  config.get('facebook.pageAccessToken');
const SERVER_URL = config.get('facebook.serverURL');

exports.sendTextMessage = function (recipientId, messageText) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			text: messageText,
		}
	};
	
	callSendAPI(messageData);
}


/*
 * Turn typing indicator on
 *
 */
exports.sendTypingOn = function (recipientId) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		sender_action: "typing_on"
	};
	
	callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
exports.sendTypingOff = function (recipientId) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		sender_action: "typing_off"
	};
	
	callSendAPI(messageData);
}

exports.callSendAPI = function (messageData) {
	callSendAPI(messageData);
}

/*
 * Verify that the callback came from Facebook. 
 *
 */
exports.verifyRequestSignature = function (req, res, buf) {
	var signature = req.headers["x-hub-signature"];
	var host = req.headers['host'];
	
	if (!signature) {
		throw new Error("Couldn't validate the request signature. Signature not present");
	} else {
		var elements = signature.split('=');
		var method = elements[0];
		var signatureHash = elements[1];
		
		var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                            .update(buf)
                            .digest('hex');
		
		if (signatureHash != expectedHash) {
			throw new Error("Couldn't validate the request signature.");
		}
	}
}

function callSendAPI(messageData) {
	request({
		uri: 'https://graph.facebook.com/v2.6/me/messages',
		qs: { access_token: FB_PAGE_TOKEN },
		method: 'POST',
		json: messageData

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var recipientId = body.recipient_id;
			var messageId = body.message_id;
			
			if (messageId) {
				console.log("Successfully sent message with id %s to recipient %s", 
                  messageId, recipientId);
			} else {
				console.log("Successfully called Send API for recipient %s", 
                  recipientId);
			}

			conclyLog.APIcall(session, "facebook", false);
		} else {
			console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
			conclyLog.APIcall(session, "facebook", true);
		}
	});
}
