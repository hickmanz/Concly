var express = require('express');
var conclyAPI = require('../controllers/api.js');

module.exports = function (app) {
	
	app.use('/api', function (req, res, next) {
		var allowedOrigins = ['https://concly.com', 'https://api.concly.com'];
		var origin = req.headers.origin;
		if (allowedOrigins.indexOf(origin) > -1) {
			res.setHeader('Access-Control-Allow-Origin', origin);
		}
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
		res.setHeader('Access-Control-Allow-Headers', 'x-access-key,content-type');
		res.setHeader('Access-Control-Allow-Credentials', true);
		
		next();
	});
	
	app.get('/api/sessions', conclyAPI.verifyKey, conclyAPI.getAll);
	app.get('/api/sessions/:id', conclyAPI.verifyKey, conclyAPI.getById);
	app.get('/api/place/details/:place_id', conclyAPI.verifyKey, conclyAPI.getDetails);
	app.post('/api/sessions/:id', conclyAPI.verifyKey, conclyAPI.updateSession);
	app.post('/api/actions/:id', conclyAPI.verifyKey, conclyAPI.completeAction);


}