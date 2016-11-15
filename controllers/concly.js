var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var config = require('config');
var express = require('express');
var https = require('https');
var fetch = require('node-fetch');
var fs = require("fs");
var Wit = require('node-wit').Wit;
var log = require('node-wit').log;
var yelpV3 = require('yelp-v3');
var findango = require('findango-api')
var querystring = require('querystring');

//Controllers
var facebook = require('./facebook.js');
var conclyLog = require('./concly.logger.js');

//Models
var Session = require('../models/mongoose-models.js').Session;

// Assets
var responses = require('../assets/responses.json');
var messages = require('../assets/messages.json');
var queryData = require('../assets/query-data.json');

//Google parameters
const GOOGLE_MAPS_API_KEY = config.get('google-maps.apiKey');

// Yelp parameters
const YELP_APP_ID = config.get('yelp.appId');
const YELP_APP_SECRET = config.get('yelp.appSecret');
const YELP_ACCESS_TOKEN = config.get('yelp.accessToken');

// Wit.ai parameters
const WIT_TOKEN = config.get('wit.token');

//Wolfram Alpha parameters
const WOLFRAM_APP_ID = config.get('wolframalpha.appId');

// Facebook parameters
const FB_APP_SECRET = config.get('facebook.appSecret');
const FB_APP_ID = config.get('facebook.appId');
const FB_VERIFY_TOKEN = config.get('facebook.validationToken');
const FB_PAGE_TOKEN =  config.get('facebook.pageAccessToken');
const SERVER_URL = config.get('facebook.serverURL');

//Init APIs
//Create yelp method for making API calls
var yelp = new yelpV3({
	access_token: YELP_ACCESS_TOKEN,
});

var googleMaps = require('@google/maps').createClient({
	key: GOOGLE_MAPS_API_KEY
});

// Setting up wit bot
var wit = new Wit({
	accessToken: WIT_TOKEN,
	logger: new log.Logger(log.INFO)
});

// setup wolfram
var wolfram = require('wolfram-alpha').createClient(WOLFRAM_APP_ID);

/*
* Get session data from mongodb by users fbid.
* If session doesn't exist then create it.
* Returns a promise. 	
*/
function getSession(fbid) {
	return new Promise(function (fulfill, reject) {
		Session.find({ fbid: fbid }, function (err, session) {
			if (err) return console.error(err);
			
			if (session.length == 0) { //session does not exist create it and grab personal info
				var newSession = new Session;
				
				newSession.fbid = fbid;
				
				//Grab users personal info from graph API
				return getPersonalInfo(newSession).then(function (res) {
					newSession = res;
					console.log("User succesfully initialized for session " + newSession._id);
					newSession.save();
					
					fulfill(newSession);
				});
			} else if (session.length > 1) { //ruh roh - shouldn't be possible given the schema
				console.log("ERROR: Multiple instances of the same fbid");
				reject("oh fuck");
			} else { //return the session if it exists
				fulfill(session[0]);
			}
		});
	});
}

/*
*Lookup personal details about user for a session and return the updated session
*Uses Graph API
*Retuns a promise.
*/
function getPersonalInfo(session) {
	return new Promise(function (fulfill, reject) {
		var options = {
			host: 'graph.facebook.com',
			path: '/v2.6/' + session.fbid + '?fields=first_name,last_name,profile_pic,timezone,locale,gender&access_token=' + FB_PAGE_TOKEN
		};
		
		var handleGraphCall = function (response) {
			var str = '';
			
			response.on('data', function (chunk) {
				str += chunk;
			});
			
			response.on('end', function () {
				var userData = JSON.parse(str);
				
				if (userData.hasOwnProperty("first_name") && userData.hasOwnProperty("last_name") && userData.hasOwnProperty("gender") && userData.hasOwnProperty("timezone") && userData.hasOwnProperty("locale")) {
					session.userData = {
						"firstName": userData.first_name,
						"lastName": userData.last_name,
						"profilePicture": userData.profile_pic,
						"gender": userData.gender,
						"timezone": userData.timezone,
						"locale": userData.locale
					}
					fulfill(session);
				} else {
					console.log("error retrieving user information");
					reject("failed");
				}
			});
		}
		https.request(options, handleGraphCall).end();
	});
}

function sendDefinedData(messageState, session) {
	return new Promise(function (resolve, reject) {
		
		var userID = session.fbid,
			dataToSend = messages[messageState],
			numberOfMessages = dataToSend.length;
		
		dataToSend.forEach(function (dataInfo , index) {
			if (dataInfo.type == "text") {
				var messageText = dataInfo.messageText;
				
				if (dataInfo.hasOwnProperty("specialInsertions")) {
					dataInfo.specialInsertions.forEach(function (insertionType, index) {
						if (insertionType == "name") {
							var replaceString = '%' + index.toString();
							messageText = messageText.replace(replaceString, session.userData.firstName);
						}
					});
				}
				
				facebook.sendTextMessage(userID, messageText)
			} else if (dataInfo.type == "as-is") {
				var messageData = dataInfo.messageData;
				
				if (dataInfo.hasOwnProperty("specialInsertions")) {
					dataInfo.specialInsertions.forEach(function (insertionType, index) {
						if (insertionType == "name") {
							var replaceString = '%' + index.toString();
							messageData.message.attachment.payload.text = messageData.message.attachment.payload.text.replace(replaceString, session.userData.firstName);
						}
					});
				}
				
				messageData.recipient.id = userID;
				
				facebook.callSendAPI(messageData);
			} else if (dataInfo.type == "random-text") {
				var messageText = responses[messageState][Math.floor(Math.random() * responses[messageState].length)];
				
				if (dataInfo.hasOwnProperty("specialInsertions")) {
					dataInfo.specialInsertions.forEach(function (insertionType, index) {
						if (insertionType == "name") {
							var replaceString = '%' + index.toString();
							messageText = messageText.replace(replaceString, session.userData.firstName);
						}
					});
				}
				facebook.sendTextMessage(userID, messageText);
			}
			
			if (index == numberOfMessages - 1) {
				resolve();
			}
		});

	});
}

exports.receivedMessage = function (event) {
	const senderID = event.sender.id;
	const recipientID = event.recipient.id;
	const timeOfMessage = event.timestamp;
	const message = event.message;
	
	
	getSession(senderID).then(function (session) {
		session.logIndex = session.log.length; //Increment log position - ONLY DO THIS IN ONE PLACE
		session.log.push(new Object()); //create the object at the new index value immediately after creating
		session.log[session.logIndex].date = new Date();
		session.log[session.logIndex].messageData = message;
		session.log[session.logIndex].fromUser = true;
		
		console.log('Received message for user %d (' + session.userData.firstName + ' ' + session.userData.lastName + ') at %d with message:', 
		senderID, timeOfMessage);
		console.log(JSON.stringify(message));
		
		var isEcho = message.is_echo;
		var messageId = message.mid;
		var appId = message.app_id;
		var metadata = message.metadata;
		
		// You may get a text or attachment but not both
		var messageText = message.text;
		var messageAttachments = message.attachments;
		var quickReply = message.quick_reply;
		
		if (isEcho) {
			// Just logging message echoes to console
			console.log("Received echo for message %s and app %d with metadata %s", 
			  messageId, appId, metadata);
			return;
		} else if (quickReply) {
			session.log[session.logIndex].type = "quick_reply";
			
			var quickReplyPayload = quickReply.payload;
			console.log("Quick reply for message %s with payload %s",
			  messageId, quickReplyPayload);
			handleQuickReply(session, quickReplyPayload);
			
			return;
		}
		
		
		if (messageText) { // CHANGE to just determine entities
			// We received a text message
			
			// Let's forward the message to the Wit.ai Bot Engine
			// This will run all actions until our bot has nothing left to do
			session.log[session.logIndex].type = "text_message";
			wit.message(messageText)
			.then(function (data) {
				facebook.sendTypingOn(session.fbid);
				determineState(session, data);
			})
			.catch(console.error);
      
        
		} else if (messageAttachments) {
			if (message.sticker_id == 369239263222822) {
				session.log[session.logIndex].type = "sticker";
				
				facebook.sendTextMessage(senderID, "Glad you like it!");
			} else if (messageAttachments[0].type == "location") {
				session.log[session.logIndex].type = "location";
				
				facebook.sendTextMessage(senderID, "Thanks!");
				
				session.location.lat = messageAttachments[0].payload.coordinates.lat;
				session.location.long = messageAttachments[0].payload.coordinates.long;
				session.location.lastUpdated = new Date();
				session.location.source = "pin";
				verifyPinLocation(session);

			} else {
				session.log[session.logIndex].type = "uknown_attachment";
				
				session.context.previousState = session.context.state;
				session.context.state = "unknown_attachment_recieved";
				session.save();
				handleState(session);
			}
		}
        
	});

}

function handleQuickReply(session, payload) {
	if (payload == "pick_for_me") {
		pickForMe(session);
	} else if (payload == "more_options") {
		sendOptions(session);
	} else if (payload == "not_what_i_wanted") {
		facebook.sendTextMessage(session.fbid, "Sorry about that.  Can you word your request a little differently?");
	}
}


function pickForMe(session) {
	var min;
	var max;
	var selectedIndex;
	
	if (session.context.extraData.shownResultsSet == 1) {
		min = 1;
		max = 10;
	} else {
		min = 1;
		max = 20;
	}
	
	selectedIndex = Math.floor(Math.random() * (max - min + 1)) + min;
	facebook.sendTextMessage(session.fbid, "I think you will like " + session.context.extraData.query.results[selectedIndex].name);
	placeChoosen(selectedIndex, session);

}

//based on context (& previous state) it will determine a state of the conversation
//Should this only determine current state and then handle state will determine what to do with state and prev state
function determineState(session, witResponse) {
	
	if (witResponse) {
		var intent;
		var entities;
		console.log('Recieved Wit.ai response: ' + JSON.stringify(witResponse));
		
		if (witResponse.hasOwnProperty('entities')) {
			entities = witResponse.entities;
			session.log[session.logIndex].entities = entities;
			
			if (witResponse.entities.hasOwnProperty('intent')) {
				intent = witResponse.entities.intent[0];
				session.log[session.logIndex].intent = intent;
			}
		}
		
		if (intent == null) {
			console.log('no intent determined');
			if (session.context.state == "need_location") {
				if (witResponse.entities.hasOwnProperty('location')) {
					session.context.entities.location = witResponse.entities.location;
				} else if (witResponse.entities.hasOwnProperty('search_query')) {
					session.context.entities.location = witResponse.entities.search_query;
				} else {
					session.context.entities.location = [{
							value: witResponse._text
						}];
				}
				checkLocation(session)
				.then(function () {
					session.context.previousState = session.context.state;
					session.context.state = "make_query";
					
					session.save();
					return session;
				})
				.then(handleState);
			} else {
				session.context.previousState = session.context.state;
				session.context.state = "make_wolfram_query";
				
				makeWolframQuery(session, witResponse._text);
			}
		} else if (intent.value == "makeQuery") {
			if (entities.hasOwnProperty('onStreet')) {
				session.context.previousIntent = session.context.intent;
				session.context.intent = intent;
				session.context.intent.value = "searchPlaces";
				session.context.previousEntities = session.context.entities;
				session.context.entities = entities;
				
				checkLocation(session)
				.then(checkCreatePlacesQuery)
				.then(handleState);
			} else {
				session.context.previousIntent = session.context.intent;
				session.context.intent = intent;
				session.context.previousEntities = session.context.entities;
				session.context.entities = entities;
				
				checkLocation(session)
				.then(checkCreateQuery)
				.then(handleState);
			}

		} else if (intent.value == "greeting") {
			session.context.previousIntent = session.context.intent;
			session.context.intent = intent;
			session.context.previousState = session.context.state;
			session.context.state = "say_hi";
			handleState(session);

		} else if (intent.value == "giveLocation") {
			if (session.context.state == "need_location") {
				session.context.previousIntent = session.context.intent;
				session.context.intent = intent;
				if (witResponse.entities.hasOwnProperty('location')) {
					session.context.entities.location = witResponse.entities.location;
				} else if (witResponse.entities.hasOwnProperty('street')) {
					session.context.entities.location = witResponse.entities.street;
				} else if (witResponse.entities.hasOwnProperty('search_query')) {
					session.context.entities.location = witResponse.entities.search_query;
				} else {
					session.context.entities.location = [{
							value: witResponse._text
						}];
				}
				
				facebook.sendTextMessage(session.fbid, "Got your location. Now let me see here");
				
				checkLocation(session)
				.then(function () {
					session.context.previousState = session.context.state;
					session.context.state = "make_query";
					
					session.save();
				})
				.then(handleState);
				
			} else {
				session.context.previousIntent = session.context.intent;
				session.context.intent = intent;
				session.context.previousEntities = session.context.entities;
				session.context.entities = entities;
				if (witResponse.entities.hasOwnProperty('location')) {
					session.context.entities.location = witResponse.entities.location;
				} else if (witResponse.entities.hasOwnProperty('street')) {
					session.context.entities.location = witResponse.entities.street;
				} else if (witResponse.entities.hasOwnProperty('search_query')) {
					session.context.entities.location = witResponse.entities.search_query;
				} else {
					session.context.entities.location = [{
							value: witResponse._text
						}];
				}
				
				checkLocation(session)
				.then(function () {
					session.context.previousState = session.context.state;
					session.context.state = "make_query";
					
					session.save();
				})
				.then(handleState);
				
				facebook.sendTextMessage(session.fbid, "Got your location. Thanks");
				//TODO send defined data how can I help you
			}
		} else if (intent.value == "requestJoke") {
			session.context.previousIntent = session.context.intent;
			session.context.intent = intent;
			session.context.previousState = session.context.state;
			session.context.state = "tell_joke";
			handleState(session);
		} else if (intent.value == "searchPlaces") {
			session.context.previousIntent = session.context.intent;
			session.context.intent = intent;
			session.context.previousEntities = session.context.entities;
			session.context.entities = entities;
			
			checkLocation(session)
            .then(checkCreatePlacesQuery)
            .then(handleState);

		} else if (intent.value == "searchPlaces") {
			session.context.previousIntent = session.context.intent;
			session.context.intent = intent;
			session.context.previousEntities = session.context.entities;
			session.context.entities = entities;
			
			checkLocation(session)
            .then(checkCreatePlacesQuery)
            .then(handleState);

		} else if (intent.value == "searchTheaters") {
			facebook.sendTextMessage(session.fbid, "This is an early build and I'm unfortunately not able to search theaters yet. Stay tuned!");

		} else if (intent.value == "searchMovies") {
			facebook.sendTextMessage(session.fbid, "This is an early build and I'm unfortunately not able to search for movies yet. Stay tuned!");

		} else if (intent.value == "searchFlights") {
			facebook.sendTextMessage(session.fbid, "This is an early build and I'm unfortunately not able to search for flights yet. Stay tuned!");

		} else if (intent.value == "searchThings") {
			facebook.sendTextMessage(session.fbid, "This is an early build and I'm unfortunately not able to search for things to do yet. Stay tuned!");

		} else {
			facebook.sendTextMessage(session.fbid, "This is an early build and I'm unfortunately not able to do that yet. Stay tuned!");
		}
	} else {


	}

}

//based on state will go through next actions
function handleState(session) {
	if (session.context.state == "unknown_attachment_recieved") {
		sendDefinedData("attachment_reply_initial", session);

	} else if (session.context.state == "need_location") {
		//here is where previous state will start to matter
		sendDefinedData("location_request", session);
	} else if (session.context.state == "need_query") {
        //send message saying didn't understand
	} else if (session.context.state == "make_query") {
		//make the api call and send data back
		facebook.sendTypingOn(session.fbid);
		makeQuery(session);
	} else if (session.context.state == "say_hi") {
		//make the api call and send data back
		sendDefinedData("greetings", session);
	} else if (session.context.state == "tell_joke") {
		//make the api call and send data back
		sendDefinedData("jokes", session);
	} else if (session.context.state == "make_places_query") {
		//make the api call and send data back
		facebook.sendTypingOn(session.fbid);
		makePlacesQuery(session);
	}
}

//Some things may require data cleanup
function handlePreviousState(session) {
	if (session.context.previousState == "unknown_attachment_recieved") {

	}
}

function makeWolframQuery(session, query) {
	return new Promise(function (fulfill, reject) {
		var response;
		
		wolfram.query(query, function (err, results) {
			if (err) throw err;
			if (results.length > 0) {
				results.forEach(function (result) {
					if (result.primary == true) {
						response = result.subpods[0].text;
					}
				});
				
				facebook.sendTextMessage(session.fbid, response);
			} else {
				facebook.sendTextMessage(session.fbid, "I'm not sure I understand. Sorry about that.");
			}
		});
	});
}

function makePlacesQuery(session) {
	var rankParam;
	
	if (session.context.entities.hasOwnProperty('byClosest') || (session.location.source == "pin" && !session.context.entities.hasOwnProperty('onStreet'))) {
		rankParam = "distance";
	} else {
		rankParam = "prominence";
	}
	
	var options = {
		keyword: session.context.extraData.query.data, 
		language: 'en',
		location: [session.location.lat, session.location.long],
		//radius: 5000, cant include rank by and radius
		minprice: 1,
		maxprice: 4,
		rankby: rankParam,
	}
	
	googleMaps.placesNearby(options, function (err, res) {
		if (!err) {
			verifyPlacesQueryResults(session, res.json.results);
		} else {
			console.log(err);
		}
	});

}

function verifyPlacesQueryResults(session, googleResponse) {
	
	var numberOfResults = googleResponse.length
	
	if (numberOfResults > 0) {
		session.context.extraData.shownResultsSet = 0;
		session.context.extraData.query.results = googleResponse;
		session.context.extraData.query.host = "google";
		session.context.extraData.query.numberOfResults = numberOfResults;
		
		setPlacesInfo(session).then(sendOptions);

	} else {
		console.log('google places error - no response from api | asking yelp')
		session.context.state = "make_query";
		handleState(session);
	}
}

function makeQuery(session) {
	var rankParam;
	
	if (session.context.entities.hasOwnProperty('byst')) {
		rankParam = "distance";
	} else {
		rankParam = "best_match";
	}
	
	var options = {
		term: session.context.extraData.query.data, 
		latitude: session.location.lat, 
		longitude: session.location.long,
		sort_by: rankParam
	}
	
	yelp.search(options)
    .then(function (yelpResponse) {
		verifyQueryResults(session, yelpResponse);
	})
    .catch(function (err) {
		console.error(err);
	});
}

function verifyQueryResults(session, yelpResponse) {
	var numberOfResults = yelpResponse.businesses.length,
		totalResults = yelpResponse.total;
	
	if (numberOfResults > 0) {
		session.context.extraData.shownResultsSet = 0;
		session.context.extraData.query.results = yelpResponse.businesses;
		session.context.extraData.query.host = "yelp";
		session.context.extraData.query.numberOfResults = numberOfResults;
		session.save();
		
		sendOptions(session);
	} else {
		//There was an error. log it 
		//going to have to start parsing the query to remove things that the yelp api doesnt like
		console.log('yelp error - no response from api')
		facebook.sendTextMessage(session.fbid, "There was some sort of error.  I've logged it and will try and fix it for next time.  In the meantime, try wording your request a little differently");
	}


}

function setPlacesInfo(session) {
	//set url as concly.com/details <- it makes the api call and changes the location of the window
	return new Promise(function (fulfill, reject) {
		for (var i = 0; i < session.context.extraData.query.results.length; i++) {
			var place = session.context.extraData.query.results[i];
			
			var dollarSigns = "";
			if (place.price_level != 0) {
				for (var k = 0; k < place.price_level; k++) {
					dollarSigns += "$";
				}
			} else {
				dollarSigns += "Free";
			}
			
			session.context.extraData.query.results[i].url = "https://concly.com/details/?place_id=" + place.place_id;
			if (place.hasOwnProperty("photos")) {
				session.context.extraData.query.results[i].image_url = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=" + place.photos[0].photo_reference + "&key=" + GOOGLE_MAPS_API_KEY;
			} else {
				session.context.extraData.query.results[i].image_url = "https://concly.com/img/bot-assets/place-img.png";
			}
			session.context.extraData.query.results[i].coordinates = {
				latitude: place.geometry.location.lat,
				longitude: place.geometry.location.lng
			};
			if (place.hasOwnProperty("opening_hours")) {
				session.context.extraData.query.results[i].is_closed = !place.opening_hours.open_now;
			} else {
				session.context.extraData.query.results[i].is_closed = null;
			}
			session.context.extraData.query.results[i].price = dollarSigns
	
		}
		session.markModified('context.extraData.query.results');
		//session.save(); breaking something for some damn reason
		fulfill(session);
	});
}

function sendOptions(session) {
	var quickReplies,
		indexStart,
		indexEnd,
		messageElements = [];
	
	
	
	if (session.context.extraData.shownResultsSet == 0) {
		session.context.extraData.shownResultsSet = 1;
		
		indexStart = 0;
		
		if (session.context.extraData.query.numberOfResults < 11) {
			indexEnd = session.context.extraData.query.numberOfResults;
			quickReplies = messages.send_options_quick_reply[1];

		} else {
			indexEnd = 10;
			quickReplies = messages.send_options_quick_reply[0];
		}

	} else if (session.context.extraData.shownResultsSet == 1) {
		session.context.extraData.shownResultsSet = 2;
		indexStart = 10;
		indexEnd = session.context.extraData.query.numberOfResults;
		
		quickReplies = messages.send_options_quick_reply[1];
	}
	
	if (session.location.source == "pin") {
		getDistanceInfo(session, indexStart, indexEnd)
			.then(constructSend);

	} else {
		constructSend(session);
	}
	
	function constructSend(session) {
		for (var i = indexStart; i < indexEnd; i++) {
			var place = session.context.extraData.query.results[i];
			var listCategories = "";
			var openStatus;
			var starCount = Math.round(place.rating);
			var stars;
			var distanceString = "";
			
			if (place.hasOwnProperty("distanceInfo")) {
				distanceString = ' \u000A' + place.distanceInfo.distance.text + "  •  " + place.distanceInfo.duration.text.replace("mins", "minute") + " 🚘"
			}
			
			for (var k = 0; k < starCount; k++) {
				if (k == 0) {
					stars = ' ⭐';
				} else {
					stars += '⭐';
				}
			}
			
			if (session.context.extraData.query.host == "yelp") {
				place.categories.forEach(function (category, index) {
					if (listCategories.length + category.title.length <= 30) {
						if (index == 0) {
							listCategories = category.title;
						} else {
							listCategories += ", " + category.title;

						}
					}

				});
			}
			
			if (place.is_closed == false) {
				openStatus = "Open";
			} else if (place.is_closed == true) {
				openStatus = "Closed"
			} else {
				openStatus = ""
			}
			
			if (place.image_url) {
				var image_url = place.image_url;
			} else {
				var image_url = "https://concly.com/img/bot-assets/place-img.png";
			}
			
			messageElements.push({
				title: place.name,
				image_url: image_url,
				item_url: place.url,
				subtitle: place.rating + stars + "  •  " + place.price + distanceString + ' \u000A' + listCategories + ' \u000A' + openStatus ,
				buttons: [{
						type: "web_url",
						url: place.url,
						title: "See more info ❓"
					}, {
						type: "web_url",
						title: "Show on map 📍",
						url: "https://concly.com/map?placeid=" + i.toString() + "&_id=" + session._id,
						messenger_extensions: true
					}, {
						type: "postback",
						title: "Choose this place 👍🏼",
						payload: "choose_place_" + i,
					}]
			});
		}
		
		var messageData = {
			recipient: {
				id: session.fbid
			},
			message: {
				attachment: {
					type: "template",
					payload: {
						template_type: "generic",
						elements: messageElements

					}
				},
				quick_replies: quickReplies
			}
		};
		session.markModified('context.extraData.query.results');
		session.save();
		facebook.callSendAPI(messageData);
	}
    
}

function getDistanceInfo(session, indexStart, indexEnd) {
	return new Promise(function (fulfill, reject) {
		var origins = []; //41.43206,-81.38992 array  = 41.43206, -81.38992 | -33.86748, 151.20699
		var destinations = [];
		
		for (var i = indexStart; i < indexEnd; i++) {
			origins.push(session.location.lat.toString() + ', ' + session.location.long.toString());
			destinations.push(session.context.extraData.query.results[i].coordinates.latitude.toString() + ', ' + session.context.extraData.query.results[i].coordinates.longitude.toString());
		}
		
		googleMaps.distanceMatrix({
			origins: origins,
			destinations: destinations,
			mode: session.preferences.distanceTimeMode,
			units: session.preferences.distanceUnits
		}, function (err, res) {
			if (!err) {
				if (res.json.rows.length > 0) {
					var j = indexStart;
					res.json.rows[0].elements.forEach(function (distanceInfo) {
						session.context.extraData.query.results[j].distanceInfo = distanceInfo;
						j++;
					});
				}
				fulfill(session);
			} else {
				console.error(err);
			}
		
		});
	});
}

function verifyPinLocation(session) {
	return new Promise(function (fulfill, reject) {
		googleMaps.reverseGeocode({
			latlng: [session.location.lat, session.location.long],
		}, function (err, res) {
			if (!err) {
				session.location.formatted_address = res.json.results[0].formatted_address;
				res.json.results[0].address_components.forEach(function (addressComponent) {
					addressComponent.types.forEach(function (type) {
						if (type == "administrative_area_level_1") {
							session.location.administrative_area_level_1 = addressComponent.short_name;
						} else if (type == "locality") {
							session.location.locality = addressComponent.short_name;
						} else if (type == "postal_code") {
							session.location.postal_code = addressComponent.short_name;
						}
					});
				});
				
				session.save();
				fulfill(session);
			} else {
				console.log("ERROR: " + err)
			}
		});

	});
	
}

function checkLocation(session) {
	return new Promise(function (fulfill, reject) {
		
		if (session.get('context.entities.location')) {
			googleMaps.geocode({
				address: session.context.entities.location[0].value
			}, function (err, res) {
				if (!err) {
					var adminLevel1_inQuery;
					var locality_inQuery;
					var adminLevel1_match = true;
					var locality_match = true;
					var newPostalCode;
					var newLocality;
					var newAdminLevel1;
					
					res.json.results[0].address_components.forEach(function (addressComponent) {
						addressComponent.types.forEach(function (type) {
							if (type == "administrative_area_level_1") {
								newAdminLevel1 = addressComponent.short_name;
								if (session.context.entities.location[0].value.toLowerCase().indexOf(addressComponent.short_name.toLowerCase()) == -1 && session.context.entities.location[0].value.toLowerCase().indexOf(addressComponent.long_name.toLowerCase()) == -1) {
									adminLevel1_inQuery = false;
								} else {
									adminLevel1_inQuery = true;
								}
							} else if (type == "locality") {
								newLocality = addressComponent.short_name;
								if (session.context.entities.location[0].value.toLowerCase().indexOf(addressComponent.short_name.toLowerCase()) == -1 && session.context.entities.location[0].value.toLowerCase().indexOf(addressComponent.long_name.toLowerCase()) == -1) {
									locality_inQuery = false;
								} else {
									locality_inQuery = true;
								}
							} else if (type == "postal_code") {
								newPostalCode = addressComponent.short_name;
							}
                        
						});
					});
					
					//if neither element was in the users location query then check to see if it is the same as the current locality
					if (!adminLevel1_inQuery && !locality_inQuery) {
						if (session.location.administrative_area_level_1.toLowerCase() == newAdminLevel1.toLowerCase()) {
							adminLevel1_match = true;
						} else {
							adminLevel1_match = false;
						}
						if (session.location.locality.toLowerCase() == newLocality.toLowerCase()) {
							locality_match = true;
						} else {
							locality_match = false;
						}
					}
					
					if (!locality_match && !adminLevel1_match) {
						//new query	
						session.context.entities.location[0].value = session.context.entities.location[0].value + " " + session.location.locality;
						googleMaps.geocode({
							address: session.context.entities.location[0].value
						}, function (err2, res2) {
							if (!err2) {
								res2.json.results[0].address_components.forEach(function (addressComponent) {
									addressComponent.types.forEach(function (type) {
										if (type == "administrative_area_level_1") {
											session.location.administrative_area_level_1 = addressComponent.short_name;
										} else if (type == "locality") {
											session.location.locality = addressComponent.short_name;
										} else if (type == "postal_code") {
											session.location.postal_code = addressComponent.short_name;
										}
                        
									});
								});
								session.location.lat = res2.json.results[0].geometry.location.lat;
								session.location.long = res2.json.results[0].geometry.location.lng;
								session.location.formatted_address = res2.json.results[0].formatted_address;
								
								session.location.lastUpdated = new Date();
								session.location.source = "text";
								session.context.previousState = session.context.state;
								session.context.state = "have_location";
								
								fulfill(session);
							}
						});


					} else {
						session.location.lat = res.json.results[0].geometry.location.lat;
						session.location.long = res.json.results[0].geometry.location.lng;
						session.location.formatted_address = res.json.results[0].formatted_address;
						
						session.location.administrative_area_level_1 = newAdminLevel1;
						session.location.locality = newLocality;
						session.location.postal_code = newPostalCode
						
						session.location.lastUpdated = new Date();
						session.location.source = "text";
						session.context.previousState = session.context.state;
						session.context.state = "have_location";
						
						fulfill(session);
					}

				} else {
					console.log("ERROR: " + err)
				}
			});

		} else if (session.get('location.lat')) {
			session.context.previousState = session.context.state;
			session.context.state = "have_location";
			fulfill(session);

		} else {
			session.context.previousState = session.context.state;
			session.context.state = "need_location";
			fulfill(session);
		}
	});
}
function checkCreatePlacesQuery(session) {
	return new Promise(function (resolve, reject) {
		var newQuery = null;
		var additonalQueryString = null;
		var includedQueryElement = false;
		
		if (session.context.entities.hasOwnProperty('onStreet')) {
			if (session.context.entities.hasOwnProperty('street')) {
				additonalQueryString = " on " + session.context.entities.street[0].value;
			} else if (session.context.entities.hasOwnProperty('location')) {
				additonalQueryString = " on " + session.context.entities.location[0].value;
			} else {
				additonalQueryString = " on " + session.context.entities.search_query[session.context.entities.search_query.length - 1].value;
				includedQueryElement = true;
			}
		}
		
		if (session.get('context.entities.search_query')) {
			session.context.entities.search_query.forEach(function (query, index) {
				if (includedQueryElement && index == session.context.entities.search_query.length - 1) {
					//skip this value, it's already being included
				} else {
					if (newQuery == null) {
						newQuery = query.value;
					} else {
						newQuery += " " + query.value;
					}
				}
			});
		}
		
		//go through all possible entity values that have to do with query
		queryData.details.forEach(function (detail) {
			//see if current entities match an entity name in query details
			var objPath = 'context.entities.' + detail.entityName;
			if (session.get(objPath)) {
				if (session.context.entities[detail.entityName][0].value) {
					if (newQuery == null) {
						newQuery = detail.placesQueryValue;
					} else {
						newQuery += ' ' + detail.placesQueryValue;
					}
				}
			}
		});
		
		if (additonalQueryString != null) {
			if (newQuery == null) {
				newQuery = 'restaurant' + additonalQueryString;
			} else {
				newQuery += additonalQueryString;
			}
		}
		
		newQuery = newQuery.replace(/[^a-zA-Z0-9\s]/g, '');
		
		//If there is a query to send
		if (newQuery == null) {
			session.context.previousState = session.context.state;
			session.context.state = "need_query";
		} else {
			console.log("the query was: " + newQuery);
			
			session.context.extraData.query.data = newQuery;
			session.context.extraData.query.time = new Date();
			
			//If we also have a location
			if (session.context.state == "have_location") {
				session.context.previousState = session.context.state;
				session.context.state = "make_places_query";
			}

		}
		session.save();
		resolve(session);
	});
}
function checkCreateQuery(session) {
	return new Promise(function (resolve, reject) {
		
		var newQuery = null;
		
		if (session.get('context.entities.search_query')) {
			session.context.entities.search_query.forEach(function (query) {
				if (newQuery == null) {
					newQuery = query.value;
				} else {
					newQuery += " " + query.value;
				}
			});
		}
		
		//go through all possible entity values that have to do with query
		queryData.details.forEach(function (detail) {
			//see if current entities match an entity name in query details
			var objPath = 'context.entities.' + detail.entityName;
			if (session.get(objPath)) {
				if (session.context.entities[detail.entityName][0].value) {
					if (newQuery == null) {
						newQuery = detail.queryValue;
					} else {
						newQuery += ' ' + detail.queryValue;
					}
				}
			}
		});
		
		newQuery = newQuery.replace(/[^a-zA-Z0-9\s]/g, '');
		
		//If there is a query to send
		if (newQuery == null) {
			session.context.previousState = session.context.state;
			session.context.state = "need_query";
		} else {
			console.log("the query was: " + newQuery);
			
			session.context.extraData.query.data = newQuery;
			session.context.extraData.query.time = new Date();
			
			//If we also have a location
			if (session.context.state == "have_location") {
				session.context.previousState = session.context.state;
				session.context.state = "make_query";
			}

		}
		session.save();
		resolve(session);
	});
}

function placeChoosen(i, session) {
	
	session.context.previousState = session.context.state;
	session.context.state = "place_choosen";
	session.context.extraData.choosenIndex = i;
	
	var place = session.context.extraData.query.results[i];
	var messageElements = [];
	
	var listCategories = "";
	var openStatus;
	var starCount = Math.round(place.rating);
	var stars;
	var distanceString = "";
	
	if (place.hasOwnProperty("distanceInfo")) {
		distanceString = '  \u000A' + place.distanceInfo.distance.text + "  •  " + place.distanceInfo.duration.text.replace("mins", "minute") + " 🚘"
	}
	
	for (var k = 0; k < starCount; k++) {
		if (k == 0) {
			stars = ' ⭐';
		} else {
			stars += '⭐';
		}
	}
	
	if (session.context.extraData.query.host == "yelp") {
		place.categories.forEach(function (category, index) {
			if (listCategories.length + category.title.length <= 30) {
				if (index == 0) {
					listCategories = category.title;
				} else {
					listCategories += ", " + category.title;

				}
			}
		});
	}
	
	if (place.is_closed == false) {
		openStatus = "Open";
	} else {
		openStatus = "Closed"
	}
	
	if (place.image_url) {
		var image_url = place.image_url;
	} else {
		var image_url = "https://concly.com/img/bot-assets/place-img.png";
	}
	
	messageElements.push({
		title: place.name,
		image_url: image_url,
		item_url: place.url,
		subtitle: place.rating + stars + "  •  " + place.price + distanceString + '  \u000A' + listCategories + '  \u000A' + openStatus ,
		buttons: [{
				type: "web_url",
				url: "https://concly.com/directions/?_id=" + session._id,
				title: "Get directions 🗺",
				webview_height_ratio: "tall",
				messenger_extensions: true,
				fallback_url: "https://concly.com/directions/?_id=" + session._id //todo just send location 
			}, {
				type: "web_url",
				title: "Call a ride 🚗",
				url: "https://concly.com/ride/?_id=" + session._id,
				webview_height_ratio: "tall",
				messenger_extensions: true,
				fallback_url: "https://concly.com/ride/?_id=" + session._id //TODO just send location for fallback
			}, {
				type: "element_share"
			}]
	});
	
	var messageData = {
		recipient: {
			id: session.fbid
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "generic",
					elements: messageElements

				}
			}
		}
	};
	
	session.save();
	facebook.callSendAPI(messageData);

}
/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
 exports.receivedAuthentication = function(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfAuth = event.timestamp;
	
	// The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
	// The developer can set this to an arbitrary value to associate the 
	// authentication callback with the 'Send to Messenger' click event. This is
	// a way to do account linking when the user clicks the 'Send to Messenger' 
	// plugin.
	var passThroughParam = event.optin.ref;
	
	console.log("Received authentication for user %d and page %d with pass " +
      "through param '%s' at %d", senderID, recipientID, passThroughParam, 
      timeOfAuth);
	
	// When an authentication is received, we'll send a message back to the sender
	// to let them know it was successful.
	facebook.sendTextMessage(senderID, "Authentication successful");
}
/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
exports.receivedDeliveryConfirmation = function (event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var delivery = event.delivery;
	var messageIDs = delivery.mids;
	var watermark = delivery.watermark;
	var sequenceNumber = delivery.seq;
	
	if (messageIDs) {
		messageIDs.forEach(function (messageID) {
			console.log("Received delivery confirmation for message ID: %s", 
              messageID);
		});
	}
	
	console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
exports.receivedPostback = function (event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfPostback = event.timestamp;
	
	facebook.sendTypingOn(senderID);
	
	getSession(senderID).then(function (session) {
		
		var payload = event.postback.payload;
		
		console.log("Received postback for user %d, (%s %s) with payload '%s' " + 
		  "at %d", senderID, session.userData.firstName, session.userData.lastName, payload, timeOfPostback);
		
		if (payload == "to_be_greeted") {
			sendDefinedData("initial", session);
		} else if (payload.substring(0, 13) == "choose_place_") {
			var placeIndex = parseInt(payload.substring(13, 15));
			placeChoosen(placeIndex, session);
		} else {
			facebook.sendTextMessage(senderID, "Well this is embarassing but this is a pretty early build and I'm not quite ready to do all my tricks yet. Try searching for places to eat or drink though!");
		}
	});
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
exports.receivedMessageRead = function (event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	
	// All messages before watermark (a timestamp) or sequence have been seen.
	var watermark = event.read.watermark;
	var sequenceNumber = event.read.seq;
	
	console.log("Received message read event for watermark %d and sequence " +
      "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
exports.receivedAccountLink = function (event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	
	var status = event.account_linking.status;
	var authCode = event.account_linking.authorization_code;
	
	console.log("Received account link event with for user %d with status %s " +
      "and auth code %s ", senderID, status, authCode);
}

exports.unknownMessagingEvent = function (userID) {
	console.log("Webhook received unknown messagingEvent: ", messagingEvent);
	facebook.sendTextMessage(userID, "It seems you have sent an unknown action. Sorry about that.");
}

exports.completeAPIAction = function (session, data) {
	console.log(JSON.stringify(data, null, 4));
	if (data.action == "choose_place") {
		console.log("choose a place: " + data.value);

	} 
}