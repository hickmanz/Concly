var config = require('config');
var mongoose = require('mongoose');
var Session = require('../models/mongoose-models.js').Session;

var concly = require('./concly.js');

const CONCLY_API_KEY = config.get('api.key');
const GOOGLE_MAPS_API_KEY = config.get('google-maps.apiKey');

var googleMaps = require('@google/maps').createClient({
	key: GOOGLE_MAPS_API_KEY
});

exports.getAll = function (req, res) {
	getAllSessions().then(function (sessions) {
		return res.json(sessions);
	});

}

exports.getById = function (req, res) {
	getSessionById(req.params.id).then(function (session) {
		res.json(session);
	});
}

exports.completeAction = function (req, res) {
	var data = req.body;
	getSessionById(req.params.id).then(function (session) {
		concly.completeAPIAction(session, data);
	});
}

exports.verifyKey = function (req, res, next){
	var apiKey = req.headers['x-access-key'];
	
	if (apiKey != CONCLY_API_KEY) {
		res.sendStatus(403);
		throw new Error("Couldn't validate concly api key");
	} else {
		next();
	}
}

exports.getDetails = function (req, res) {
	googleMaps.place({
		placeid: req.params.place_id,
		language: 'en'
	}, function (err, response) {
		if (!err) {
			res.json(response.json.result);
		}
	});
}
exports.updateSession = function (req, res) {
	var data = req.body;
	getSessionById(req.params.id).then(function (session) {
		//use data to update retrieved session
		data.forEach(function (change) {
			session.set(change.path, change.value);
		});
		session.save();
	});
}

function getAllSessions() {
	return new Promise(function (fulfill, reject) {
		Session.find({}, function (err, sessions) {
			if (err) return console.error(err);
			
			fulfill(sessions);
		});
	});
}

function getSessionById(id) {
	return new Promise(function (fulfill, reject) {
		Session.find({_id: id}, function (err, sessions) {
			if (err) return console.error(err);
			
			fulfill(sessions[0]);
		});
	});
}