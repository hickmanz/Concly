var express = require('express');
var facebook = require('../controllers/facebook.js');
var bodyParser = require('body-parser');
var concly = require('../controllers/concly.js');

module.exports = function (app) {
	
	//For messenger webhook handling
	app.use(bodyParser.json({ verify: facebook.verifyRequestSignature }));
	
	// Message handler
	app.post('/webhook', function (req, res) {
		const data = req.body;
		
		if (data.object === 'page') {
			// Iterate over each entry
			// There may be multiple if batched
			data.entry.forEach(function (pageEntry) {
				var pageID = pageEntry.id;
				var timeOfEvent = pageEntry.time;
				
				// Iterate over each messaging event
				pageEntry.messaging.forEach(function (messagingEvent) {
					if (messagingEvent.optin) {
						concly.receivedAuthentication(messagingEvent);
					} else if (messagingEvent.message) {
						concly.receivedMessage(messagingEvent);
					} else if (messagingEvent.delivery) {
						concly.receivedDeliveryConfirmation(messagingEvent);
					} else if (messagingEvent.postback) {
						concly.receivedPostback(messagingEvent);
					} else if (messagingEvent.read) {
						concly.receivedMessageRead(messagingEvent);
					} else if (messagingEvent.account_linking) {
						concly.receivedAccountLink(messagingEvent);
					} else {
						concly.unknownMessagingEvent(userID);
					}
				});
			});
			res.sendStatus(200);
		}
	});


}