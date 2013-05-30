utils = require '../utils'

files =
	# Things only used by options
	'dist/options.concat.js': [
		'lib/backbone.js'
		'lib/backbone.marionette.js'
		'lib/rivets.min.js'
		'options/js/rivets.cfg.js'
		'options/js/router.js'
		'options/js/controller.js'
		'options/js/topics.js'
		'options/js/settings.js'
		'options/js/changes.view.js'
		'options/js/settings.view.js'
		'options/js/navigation.view.js'
		'options/js/app.js'
	],

	# Libs shared by main and options
	'dist/common.concat.js': [
		'shared.js'
		'lib/localstore.js'
		'lib/jquery-1.9.1.min.js'
		'lib/underscore.min.js'
	]

	# Things only used by main
	'dist/main.concat.js': [
		'lib/animation.js'
		'lib/mixpanel.js'
		'main.js'
	]

# files = utils.prependPath files, 'build/'

module.exports =
	dist:
		files:
			files
