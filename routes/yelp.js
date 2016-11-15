var express = require('express');
var https = require('https');
var querystring = require('querystring');
var config = require('config');

const YELP_APP_ID = config.get('yelp.appId');
const YELP_APP_SECRET = config.get('yelp.appSecret');

module.exports = function (app) {
	app.get('/yelp-access-token', function (req, res) {
		
		res.sendStatus(200);
		
		var options = {
			host: 'api.yelp.com',
			path: '/oauth2/token',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		};
		
		var post_data = querystring.stringify({
			'grant_type' : 'client_credentials',
			'client_id': YELP_APP_ID,
			'client_secret': YELP_APP_SECRET
		});
		
		var handleCall = function (response) {
			var str = '';
			
			//another chunk of data has been recieved, so append it to `str`
			response.on('data', function (chunk) {
				str += chunk;
			});
			
			//the whole response has been recieved
			response.on('end', function () {
				var data = JSON.parse(str);
				console.dir(data);
			});
		}
		
		var post_req = https.request(options, handleCall);
		
		post_req.write(post_data);
		post_req.end();

	});

}