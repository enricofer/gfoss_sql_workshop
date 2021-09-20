
var query = gup('query');
var tab = gup('tab');
var title = gup('title');

if (tab != "") {
	document.getElementById(tab+"_tab").click();
}

if (query != "") {
	document.getElementById('code').value = unescape(query);
}

if (title != "") {
	document.getElementById('title').innerHTML = unescape(title);
    document.getElementById('file').style.display = "none";
}

function gup(name)
{
  name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
  var regexS = "[\\?&]"+name+"=([^&#]*)";
  var regex = new RegExp( regexS );
  var results = regex.exec( window.location.href );
  if( results == null )
    return "";
  else
    return results[1];
}



window.onload = function () {
	var id = 0;
	var collection = { type: 'FeatureCollection', features: [] };
	var runWasm = location.search.substr(1) === 'wasm';
	var editor = CodeMirror.fromTextArea(document.getElementById('code'), {
		mode: 'text/x-sql',
		keyMap: 'sublime',
		theme: 'monokai',
		viewportMargin: Infinity,
		lineWrapping: true,
		scrollbarStyle: 'native'
	});

	function renderdata(data) {

		var tbl = document.getElementById('tbl');
		if (data) {
			var html = '<table><tr>';
            var numrows = 0
			html += data.columns.reduce(function (html, d) {
				html += '<th>' + d + '</th>';
				return html;
			}, '') + '</tr>';
			html += data.values.reduce(function (html, row) {
				numrows += 1
				html += '<tr>';
				row.forEach(function (col) {
					var cell
					if (typeof col === 'string' && col.includes(',"coordinates":[')) {
						cell = col.substring(0, 70) + "... "
					} else {
						cell = col
					}
					html += '<td>' + (typeof cell === 'string' || typeof cell === 'number' ? cell : typeof cell) + '</td>';
				});
				html += '</tr>';
				return html;
			}, '');
			html += '</table>';

			tbl.innerHTML = html;
			document.getElementById('numrows').innerHTML = numrows.toString()+" righe"
			draw(data);
		} else {
			tbl.innerHTML = '';
		}

	}
	var timer = {
		running: false,
		span: document.getElementById('time'),
		interval: null,
		start: function () {
			console.log("start")
			timer.time = Date.now();
			timer.interval = setInterval(function() { timer.run() }, 10);
			timer.running = true;
		},
		stop: function () {
			console.log("stop")
			if (timer.running){
				clearInterval(timer.interval);
				timer.running = false;
			}
		},
		run: function () {
			timer.span.innerHTML = ((Date.now() - timer.time) / 1000).toFixed(2) + ' sec';
		},
		time: Date.now()
	};
	mapboxgl.accessToken = 'pk.eyJ1IjoicXVhc2lnaXQiLCJhIjoiY2pib3h1aWF4NXJrMTJxbnVhbG9qeTdqeSJ9.5pJbvgw8_UJ8bZAQ_V9dOg';
	var map = new mapboxgl.Map({
		container: 'map',
		style: 'mapbox://styles/mapbox/dark-v9',
		zoom: 2
	}).on('load', function() {
		map.addSource('source', { type: 'geojson', data: collection });
		map.addLayer({
			id: 'poly',
			type: 'fill',
			source: 'source',
			paint: {
				'fill-color': '#ae81ff',
				'fill-opacity': 0.4
			},
			filter: ['==', '$type', 'Polygon']
		});
		map.addLayer({
			id: 'line',
			type: 'line',
			source: 'source',
			layout: {
				'line-join': 'round',
				'line-cap': 'round'
			},
			paint: {
				'line-color': '#e6db74',
				'line-width': 1
			},
			filter: ['==', '$type', 'LineString']
		});
		map.addLayer({
			id: 'point',
			type: 'circle',
			source: 'source',
			paint: {
				'circle-radius': 4,
				'circle-color': '#f92672'
			},
			filter: ['==', '$type', 'Point'],
		});
	});
	map.addControl(new mapboxgl.NavigationControl());
	var worker = new Worker(
		runWasm ? 'dist/wasm/spatiasql.worker.js' : 'dist/spatiasql.worker.js'
	);

	function getPropTable(props) {
		var info = '<div class="propTab"><small><table>';

		for (var key in props) {
			if (props.hasOwnProperty(key)&&(key !='geometry')) {
				info += "<tr>"
				info += "<td><strong>" + key + "</strong></td>"
				info += '<td style="padding-left:8px;">' + props[key] + '</td>';
				info += "</tr>"
			}
		}

		info += "</table></small></div>";
		return info
	}
	
		
	map.on('click', 'poly', function(e) {
		console.log(e)
		new mapboxgl.Popup()
		.setLngLat(e.lngLat)
		.setHTML(getPropTable(e.features[0].properties))
		.addTo(map);
		});

	worker.onerror = function (evt) {
		document.getElementById('error').innerHTML = evt.message;
		timer.stop();
		document.getElementById('run').style.display = "block"
		document.getElementById('terminate').style.display = "none"
	};
	
	worker.onmessage = function (evt) {
		console.log(evt)
		if (evt.data.initialized) {
			var xhr = new XMLHttpRequest();
			xhr.open('GET', "data/piem.sqlite", true);
			xhr.responseType = 'arraybuffer';
			xhr.onload = function(e) {
				var uInt8Array = new Uint8Array(this.response);
				worker.postMessage({
					id: 0,
					action: 'open',
					buffer: uInt8Array
				});
			};
			xhr.send();
			timer.start();
		}
		if (evt.data.id === 0) {
			if (query != "") {
		  	var sql = editor.getValue();
		  } else {
				//var sql = 'SELECT sqlite_version(), spatialite_version(), proj4_version(), geos_version()'
				var sql = editor.getValue();
			}
			worker.postMessage({
				id: id++,
				action: 'exec',
				sql: sql
			});

			document.getElementById("t_tab").click();
		} else {
			if (Array.isArray(evt.data.results)) {
				timer.stop();
				renderdata(evt.data.results[0]);
				document.getElementById('run').style.display = "block"
				document.getElementById('terminate').style.display = "none"
			}
		}
	};

	document.getElementById('run').addEventListener('click', function (evt) {
		var sql = editor.getValue();
		document.getElementById('error').innerHTML = '';
		if (sql.length > 0) {
			timer.start();
			worker.postMessage({
				id: id++,
				action: 'exec',
				sql: sql
			});
			document.getElementById('terminate').style.display = "block"
			document.getElementById('run').style.display = "none"
		}
	});

	document.getElementById('terminate').addEventListener('click', function (evt) {
		worker.terminate()
		timer.stop()
		document.getElementById('run').style.display = "block"
		document.getElementById('terminate').style.display = "none"
	});

	function draw (res) {
		var features = [], cols = res.columns, rows = res.values;
		var hasGeojson;
		for (var c = 0, cs = cols.length; c < cs; c++) {
			if (cols[c].toLowerCase().indexOf('geojson') >= 0) {
				for (var r = 0, rs = rows.length; r < rs; r++) {
					try {
						var geojson = JSON.parse(rows[r][c]);
						var feature = {
							type: 'Feature',
							properties: {},
							geometry: geojson
						};
						rows[r].forEach(function (data, index) {
							if (index !== c) {
								if (typeof data === 'number')
								feature.properties[cols[index]] = data.toFixed(2);
								else if (typeof data === 'string')
								feature.properties[cols[index]] = (data.length > 20 ? data.substr(0, 20) + '..' : data);
							}
						});
						rows[r][c] = geojson;
						if (feature.geometry)
							features.push(feature);
					} catch (e) {
						console.log(e);
					}
				}
			}
		}
		collection.features = features;
		map.getSource('source').setData(collection);
		if (features.length > 0) {
			document.getElementById("m_tab").click();
			map.fitBounds(turf.bbox(collection), { padding: 20 });
		} else {
			document.getElementById("t_tab").click();
		}
	}

	document.getElementById('file').addEventListener('change', function () {
		var file = this.files.item(0);
		if (file) {
			var reader = new FileReader();
			reader.onload = function () {
				worker.postMessage({
					id: id++,
					action: 'open',
					buffer: new Uint8Array(reader.result)
				});
				worker.postMessage({
					id: id++,
					action: 'exec',
					sql: 'SELECT * FROM sqlite_master WHERE type="table" OR type="view"'
				});
			}
			reader.readAsArrayBuffer(file);
		}
	});

	document.getElementById('listtables').addEventListener('click', function (evt)  {
		worker.postMessage({
			id: id++,
			action: 'exec',
			sql: "SELECT name,type,replace(substr(sql,instr(sql, '(')+1, instr(sql, ')')-1), ',', '<br/>') as fields FROM sqlite_master WHERE type in ('table','view') AND name NOT LIKE 'sql%' and name NOT LIKE 'idx_%' and name NOT LIKE 'geometry_%' and name NOT LIKE 'spatial_%' and name NOT LIKE 'views_%' and name NOT LIKE 'virts_%' and name NOT LIKE 'Elementary%' and name NOT LIKE 'geom_%' and name NOT LIKE 'vector_%' ORDER BY 1;"
		});
		document.getElementById("t_tab").click();
	})

}
