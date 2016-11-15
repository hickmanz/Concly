var express = require('express');

module.exports = function (app) {
	
	// Message handler - not currently used
	app.post('/alexa', function (req, res) {
		// Parse the Messenger payload
		const data = req.body;
		console.log("############################ ALEXA CALL ##########################");
		console.dir(data);
		res.sendStatus(200);

	});
}