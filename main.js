var BASE_URL      = 'http://www.memrise.com';
var DASHBOARD_URL = BASE_URL + '/home/';
var LOGIN_URL     = BASE_URL + '/login/';

var COLORS = {
	harvest: [ 250, 177, 31, 255 ],
	wilting: [ 21, 161, 236, 255 ]
};

var STRINGS = {
	harvest: "%s: Harvest plants",
	wilting: "%s: Water %d wilting plant"
};

var UPDATE_INTERVAL = 5; // Minutes
var anim = new Animation();
var groupsCache;

var settings = new Store("settings", DEFAULTS);

var consoleHolder = console;
var console = {};

['log', 'info', 'error', 'debug'].forEach(function(e) {
	console[e] = function() {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('[' + (new Date()).toISOString() + ']');
		consoleHolder[e].apply(consoleHolder, args);
	};
});

var openURL = function(url, newTab) {
	if (newTab) {
		chrome.tabs.create({ 'url': url });
	} else {
		chrome.tabs.update({ 'url': url });
	}
};

var openOptions = function() {
	openURL('options.html?installed', true);
};

var noBadge = function(url, title) {
	localStorage.actionURL = url;
	chrome.browserAction.setBadgeText({ text: '' });
	chrome.browserAction.setTitle({ title: title });
};

var setErrorBadge = function(err) {
	if (err === 'not-logged-in') {
		noBadge(LOGIN_URL, 'Log in to Memrise');
	}
};

var setBadge = function(group) {
	if (group) {
		var count;

		if (group.harvestable) {
			var path = _.find(group.courses, function(c) {
				return c.harvestPath;
			}).harvestPath;

			var type = 'harvest',
				text = 'H';
		} else if (group.wilting && group.wilting > settings.get('wilting-threshold')) {
			var path  = group.waterPath,
				type  = 'wilting',
				count = group.wilting,
				text  = group.wilting.toString();
		} else {
			return noBadge(DASHBOARD_URL, 'Go to Memrise dashboard');
		}

		var title = STRINGS[type].replace('%d', count).replace('%s', group.name);
		if (type === 'wilting' && count !== 1) {
			title += 's';
		}

		localStorage.actionURL = BASE_URL + path;

		chrome.browserAction.setBadgeBackgroundColor({ color: COLORS[type] });
		chrome.browserAction.setBadgeText({ text: text });
		chrome.browserAction.setTitle({ title: title });
	} else {
		return noBadge(DASHBOARD_URL, 'Go to Memrise dashboard');
	}
};

var parseHTML = function(html, cb) {
	if (html.search(/'is_authenticated': false/) >= 0) {
		return cb('not-logged-in');
	}

	html = html.replace(/<img\b[^>]*\/>/ig,'');
	var $html  = $($.parseHTML(html));
	var groups = [];

	// .whitebox is a single group of courses, like "Animals"
	$('.whitebox', $html).each(function() {
		var group = {
			name: $('.groupname', this).text(),
			wilting: 0,
			courses: []
		};


		group.id = group.name // Used in options.js but I'm lazy
			.toLowerCase()
			.replace(/[^a-z\s]*/g, '')
			.replace(/\s+/, '-');

		var m, href, btn = $('.group-header .btn', this);
		if (href = btn.attr('href')) {
			group.waterPath = href;

			if (m = btn.text().match(/Water (\d+)/)) {
				group.wilting = parseInt(m[1]);
			}
		}

		$('.course-box-wrapper', this).each(function() {
			var course = {
				title: $('a.inner-wrap', this).attr('title'),
				id: parseInt($('.course-progress-box', this).attr('data-course-id'))
			};

			var $harvest = $('.btn[href*="harvest"]', this);
			if ($harvest.length > 0) {
				course.harvestPath = $harvest.attr('href');

				// Make it easier to check which groups have harvestable
				group.harvestable = true;
			}

			group.courses.push(course);
		});

		groups.push(group);
	});

	cb(null, groups);
};

var fetchGroups = function(cb, opts) {
	opts = opts !== undefined ? opts : {};

	if (groupsCache && opts.cache) {
		return cb(null, groupsCache);
	}

	var parse = function(html) {
		parseHTML(html, function(err, groups) {
			if (err) {
				cb(err);
			} else {
				cb(null, groups);
				groupsCache = groups;
			}
		});
	};

	if (opts.html) {
		console.log('fetchGroups: parsing html');
		parse(opts.html);
	} else {
		get(DASHBOARD_URL, parse);
	}
};

var sortGroups = function(a, b) {
	if (a.harvestable) {
		return 1;
	} else if (b.harvestable) {
		return -1;
	}

	if (a.wilting > b.wilting) {
		return 1;
	} else if (b.wilting > a.wilting) {
		return -1;
	}

	return 0;
};

var refreshButton = function(opts) {
	reschedule();

	opts = opts !== undefined ? opts : {};
	console.log('refreshing button', opts);

	if (opts.animate) {
		anim.start();
	}

	fetchGroups(function(err, groups) {
		anim.stop();

		if (err) {
			console.log('error fetching data:', err);
			setErrorBadge(err);

			if (err === 'not-logged-in') {
				anim.doNext(function() {
					anim.drawIcon('unlogged');
				});
			}
		} else {
			// Makes sure the icon is not grey if user is logged in.
			// No reason to run this if the icon is not currently grey, but
			// on the other hand there is no harm either.
			anim.doNext(function() {
				anim.drawIcon('logged');
			});

			var groupsSetting = settings.get('topics');
			if (groupsSetting) {
				groups = _.filter(groups, function(group) {
					return groupsSetting[group.id] === true;
				});
			}

			setBadge(_.last(groups.sort(sortGroups)));
		}
	}, opts);
};

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	console.log('request "' + request.type + '"', sender);

	var methods = {
		'refresh': function() {
			refreshButton({ animate: true });
		},
		'refresh-from-cache': function() {
			refreshButton({ cache: true });
		},
		'home': function() {
			refreshButton({ html: request.html });
		}
	};

	methods[request.type]();
});

chrome.browserAction.onClicked.addListener(function() {
	track('Button Click');

	var url;
	if (url = localStorage.actionURL) {
		openURL(url);
	}
});

chrome.runtime.onInstalled.addListener(function() {
	// Make sure the super properties are set in the events that are sent
	// before going to the options for the first time
	mixpanel.register(prepareProps());

	track('Extension Installed', {
		'version': chrome.app.getDetails().version,
		'update': !!localStorage.firstInstalled
	});

	console.log('installed... refreshing');
	refreshButton({ animate: true });

	if (!localStorage.firstInstalled) {
		localStorage.firstInstalled = Date.now();
		openURL('options.html?installed', true);
	}
});

chrome.alarms.onAlarm.addListener(function(alarm) {
	console.log('got alarm', alarm);
	refreshButton();
});

if (chrome.runtime && chrome.runtime.onStartup) {
	chrome.runtime.onStartup.addListener(function() {
		console.log('starting browser... refreshing');
		refreshButton({ animate: true });
	});
}

function reschedule() {
	chrome.alarms.create('refresh', { periodInMinutes: UPDATE_INTERVAL });
}

// As an event page, this code is run every time the extension wakes up for
// whatever reason (alarm, opening options etc.) The point here is to make
// sure the alarm set up. Technically it should only be necessary to set up
// an alarm when the extension is installed.
chrome.alarms.get('refresh', function(alarm) {
	if (alarm) {
		console.log('alarm exists', alarm);
	} else {
		console.log("alarm doesn't exist, creating a new alarm");
		reschedule();
	}
});
