var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var sessionSchema = new Schema( {
	fbid: { type: String, index: { unique: true } },
	sessionCreated: { type: Date, default: Date.now },
	context: {
		state: { type: String, default: "new_user" }, 
		previousState: { type: String, default: "new_user" }, 
		intent: {
			confidence: Number,
			value: String
		}, 
		entities: { type: Schema.Types.Mixed },
		previousIntent: {
			confidence: Number,
			value: String
		}, 
		previousEntities: { type: Schema.Types.Mixed },
		extraData: {
			query: {
				data: { type: String, default: null }, 
				time: Date,
				host: String,
				id: String,
				results: [Schema.Types.Mixed],
				numberOfResults: Number
			},
			choosenId: Number,
			choosenIndex: Number,
			shownResultsSet: Number
		}
	},
	userData: {
		firstName: String,
		lastName: String,
		profilePicture: String,  
		gender: String,
		timezone: Number,
		locale: String
	},
	preferences: {
		navigation: { type: String, default: null }, 
		rideShare: { type: String, default: null },
		distanceTimeMode: { type: String, default: "driving" },
		distanceUnits: { type: String, default: "imperial" },
	},
	location: {
		long: Number,
		lat: Number,
		formatted_address: String,
		postal_code: String,
		locality: String,
		administrative_area_level_1: String,
		lastUpdated: Date,
		source: String
	},
	logIndex: { type: Number, default: -1 },
	log : [Schema.Types.Mixed]
}, { strict: false }); //strict false allows saving of properties that don't currently exist in the schema

sessionSchema.virtual('userData.fullName').get(function () {
	return this.userData.firstName + ' ' + this.userData.lastName;
});

var Session = mongoose.model('sessions', sessionSchema);

module.exports = {
	Session: Session
}