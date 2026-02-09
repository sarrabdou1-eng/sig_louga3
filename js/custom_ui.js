(function(){
    function onReady(fn){
        if(document.readyState==='complete' || document.readyState==='interactive') setTimeout(fn,0);
        else document.addEventListener('DOMContentLoaded', fn);
    }

    function waitForMap(cb){
        if(typeof window.map !== 'undefined') return cb();
        var i=0; var iv=setInterval(function(){ i++; if(typeof window.map !== 'undefined'){ clearInterval(iv); cb(); } if(i>100){ clearInterval(iv); console.warn('map not found'); } },100);
    }

    onReady(function(){
        waitForMap(init);
    });

    function init(){
        // Move existing layers control into left panel
        var layersEl = document.querySelector('.leaflet-control-layers');
        var layersContainer = document.getElementById('layersContainer');
        if(layersEl && layersContainer){
            layersContainer.appendChild(layersEl);
            layersEl.classList.remove('leaflet-control');
        }
        // Move basemap/legend (if any) into right panel
        var basemapContainer = document.getElementById('basemapContainer');
        var legendContainer = document.getElementById('legendContainer');
        // The legend images are referenced in overlaysTree; build legend thumbnails
        // Try to copy qgis legend images present under /legend
        var legendHtml = '';
        try{
            var legendImgs = document.querySelectorAll('#layersContainer img');
            legendImgs.forEach(function(img){
                var src = img.src;
                if(src && src.indexOf('legend/')!==-1){
                    legendHtml += '<div class="legend-item"><img src="'+src+'"/></div>';
                }
            });
        }catch(e){}
        if(legendHtml){ legendContainer.innerHTML = legendHtml; }

        // Panel toggles
        document.getElementById('hide-left').addEventListener('click', function(){ document.getElementById('leftPanel').style.display='none'; });
        document.getElementById('toggle-left').addEventListener('click', function(){ var p=document.getElementById('leftPanel'); p.style.display = (p.style.display==='none' || getComputedStyle(p).display==='none')? 'block':'none'; });
        document.getElementById('hide-right').addEventListener('click', function(){ document.getElementById('rightPanel').style.display='none'; });

        // Nav menu actions
        var navHome = document.getElementById('nav-home'); if(navHome) navHome.addEventListener('click', function(e){ e.preventDefault(); try{ setBounds(); }catch(err){ if(map && map.setView) map.setView([15.5, -15], 8); } });
        var navAbout = document.getElementById('nav-about'); if(navAbout) navAbout.addEventListener('click', function(e){ e.preventDefault(); alert('Projet de cartographie web de la région de Louga — auteur: Abdou SARR'); });
        var navCatalog = document.getElementById('nav-catalog'); if(navCatalog) navCatalog.addEventListener('click', function(e){ e.preventDefault(); var p=document.getElementById('leftPanel'); p.style.display = (p.style.display==='none' || getComputedStyle(p).display==='none')? 'block':'none'; });
        var navDownload = document.getElementById('nav-download'); if(navDownload) navDownload.addEventListener('click', function(e){ e.preventDefault(); var p=document.getElementById('leftPanel'); p.style.display='block'; document.getElementById('layerExport') && document.getElementById('layerExport').focus(); });
        var navTools = document.getElementById('nav-tools'); if(navTools) navTools.addEventListener('click', function(e){ e.preventDefault(); var el = document.querySelector('.leaflet-control-measure-toggle'); if(el){ el.click(); } else { alert('Outils non disponibles'); } });

        // Add dynamic coordinates
        var coordsSpan = document.getElementById('coords');
        map.on('mousemove', function(e){
            coordsSpan.textContent = 'Lng: ' + e.latlng.lng.toFixed(5) + ', Lat: ' + e.latlng.lat.toFixed(5);
        });

        // Add scale control
        if(typeof L.control.scale === 'function') L.control.scale({position:'bottomleft', metric:true, imperial:false}).addTo(map);

        // Add mini map (with rectangle showing current view)
        try{
            if(typeof L.Control.MiniMap !== 'undefined' && typeof layer_OpenStreetMap_2 !== 'undefined'){
                var mini = new L.Control.MiniMap(layer_OpenStreetMap_2, {
                    toggleDisplay: true,
                    position: 'bottomright',
                    width: 150,
                    height: 100,
                    zoomLevelOffset: -5,
                    aimingRectOptions: { color: '#ff7800', weight: 2, fill: false }
                }).addTo(map);
                // expose for debugging and secondary updates
                map._miniMapControl = mini;
                // ensure rectangle updates after main map moves
                map.on('moveend', function(){ try{ if(mini && typeof mini._update === 'function') mini._update(); }catch(e){} });
            }
        }catch(e){ console.warn('MiniMap init failed', e); }

        // Footer buttons
        document.getElementById('btn-zoom-in').addEventListener('click', function(){ map.zoomIn(); });
        document.getElementById('btn-zoom-out').addEventListener('click', function(){ map.zoomOut(); });
        document.getElementById('btn-reset-view').addEventListener('click', function(){ try{ setBounds(); }catch(e){ console.warn(e); } });
        document.getElementById('btn-measure').addEventListener('click', function(){ var el = document.querySelector('.leaflet-control-measure-toggle'); if(el) el.click(); });
        // Print: prefer easyPrint plugin if available
        var easyPrintControl = null;
        try{
            if(typeof L.easyPrint !== 'undefined'){
                easyPrintControl = L.easyPrint({ title: 'Imprimer', position: 'topleft', exportOnly:false, hideControlContainer: false }).addTo(map);
            }
        }catch(e){ console.warn('easyPrint init failed', e); }
        document.getElementById('btn-print').addEventListener('click', function(){ if(easyPrintControl && typeof easyPrintControl.printMap === 'function'){ easyPrintControl.printMap('CurrentSize', 'Carte'); } else { window.print(); } });

        // Downloads
        document.getElementById('download-geojson').addEventListener('click', function(){ downloadGeoJSON(); });
        document.getElementById('download-csv').addEventListener('click', function(){ downloadCSV(); });

        // Populate per-layer export selector
        var layerSelect = document.getElementById('layerExport');
        var layerMap = {}; // value -> layer
        try{
            if(typeof overlaysTree !== 'undefined' && Array.isArray(overlaysTree)){
                overlaysTree.forEach(function(item, idx){
                    if(item && item.layer){
                        var tmp = document.createElement('div'); tmp.innerHTML = item.label || ('Layer ' + idx);
                        var text = tmp.textContent || tmp.innerText || ('Layer ' + idx);
                        var val = 'layer_' + idx;
                        var opt = document.createElement('option'); opt.value = val; opt.text = text;
                        layerSelect.appendChild(opt);
                        layerMap[val] = item.layer;
                    }
                });
            }
        }catch(e){ console.warn('populate layer select failed', e); }

        document.getElementById('export-geojson-layer').addEventListener('click', function(){
            var val = layerSelect.value;
            if(!val){ downloadGeoJSON(); return; }
            var layer = layerMap[val];
            if(!layer){ alert('Couche introuvable'); return; }
            var gj = null;
            try{ gj = layer.toGeoJSON(); }catch(e){ console.warn(e); }
            if(!gj){ alert('Aucune entité'); return; }
            var data = JSON.stringify(gj);
            var blob = new Blob([data], {type: 'application/vnd.geo+json'});
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a'); a.href = url; a.download = (layer.options && layer.options.layerName? layer.options.layerName : 'layer') + '.geojson'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        });

        document.getElementById('export-csv-layer').addEventListener('click', function(){
            var val = layerSelect.value;
            if(!val){ downloadCSV(); return; }
            var layer = layerMap[val];
            if(!layer){ alert('Couche introuvable'); return; }
            var gj = null;
            try{ gj = layer.toGeoJSON(); }catch(e){ console.warn(e); }
            if(!gj || !gj.features || !gj.features.length){ alert('Aucune entité'); return; }
            var keys = {};
            gj.features.forEach(function(f){ Object.keys(f.properties||{}).forEach(function(k){ keys[k]=true; }); });
            var headers = Object.keys(keys);
            var rows = [headers.join(',')];
            gj.features.forEach(function(f){ var vals = headers.map(function(h){ var v = f.properties? f.properties[h] : ''; if(v===null || typeof v==='undefined') v=''; return '"'+String(v).replace(/"/g,'""')+'"'; }); rows.push(vals.join(',')); });
            var csv = rows.join('\n');
            var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a'); a.href = url; a.download = (layer.options && layer.options.layerName? layer.options.layerName : 'layer') + '.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        });

        // simple function to collect GeoJSON from map layers
        function collectGeoJSON(){
            var features = [];
            map.eachLayer(function(layer){
                try{
                    if(layer instanceof L.GeoJSON){
                        var gj = layer.toGeoJSON();
                        if(gj && gj.features && gj.features.length) features = features.concat(gj.features);
                    }
                }catch(e){}
            });
            return { type: 'FeatureCollection', features: features };
        }

        function downloadGeoJSON(){
            var fc = collectGeoJSON();
            var data = JSON.stringify(fc);
            var blob = new Blob([data], {type: 'application/vnd.geo+json'});
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'louga_layers.geojson'; document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        }

        function downloadCSV(){
            var fc = collectGeoJSON();
            if(!fc.features.length){ alert('Aucune entité à exporter'); return; }
            var keys = {};
            fc.features.forEach(function(f){ Object.keys(f.properties||{}).forEach(function(k){ keys[k]=true; }); });
            var headers = Object.keys(keys);
            var rows = [headers.join(',')];
            fc.features.forEach(function(f){ var vals = headers.map(function(h){ var v = f.properties? f.properties[h] : ''; if(v===null || typeof v==='undefined') v=''; return '"'+String(v).replace(/"/g,'""')+'"'; }); rows.push(vals.join(',')); });
            var csv = rows.join('\n');
            var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a'); a.href = url; a.download = 'louga_layers.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }

        // Ensure panels initially visible
        document.getElementById('leftPanel').style.display='block';
        document.getElementById('rightPanel').style.display='block';

        // ===== Modal Management =====
        function openModal(modalId){
            var modal = document.getElementById(modalId);
            if(modal) modal.classList.add('show');
        }
        function closeModal(modalId){
            var modal = document.getElementById(modalId);
            if(modal) modal.classList.remove('show');
        }

        // Spatial Query Modal handlers
        var spatialModal = document.getElementById('spatialQueryModal');
        if(spatialModal){
            document.querySelector('#spatialQueryModal .modal-close').addEventListener('click', function(){ closeModal('spatialQueryModal'); });
            document.getElementById('spatial-cancel').addEventListener('click', function(){ closeModal('spatialQueryModal'); });
            
            // Populate layers in spatial query
            var spatialLayersDiv = document.getElementById('spatialLayers');
            try{
                if(typeof overlaysTree !== 'undefined' && Array.isArray(overlaysTree)){
                    overlaysTree.forEach(function(item, idx){
                        if(item && item.layer && item.label){
                            var tmp = document.createElement('div'); tmp.innerHTML = item.label;
                            var text = tmp.textContent || tmp.innerText || ('Layer ' + idx);
                            var chk = document.createElement('label');
                            chk.style.display = 'flex'; chk.style.alignItems = 'center'; chk.style.gap = '8px'; chk.style.margin = '4px 0';
                            var input = document.createElement('input');
                            input.type = 'checkbox'; input.value = idx; input.checked = true;
                            chk.appendChild(input);
                            chk.appendChild(document.createTextNode(text));
                            spatialLayersDiv.appendChild(chk);
                        }
                    });
                }
            }catch(e){ console.warn('populate spatial layers failed', e); }

            // spatial-submit handler: behavior implemented later (avoid duplicate handlers)
            // keep this empty so later wiring will handle execution
            // document.getElementById('spatial-submit') will be wired after functions are defined
        }

        // Attribute Query Modal handlers
        var attrModal = document.getElementById('attributeQueryModal');
        if(attrModal){
            document.querySelector('#attributeQueryModal .modal-close').addEventListener('click', function(){ closeModal('attributeQueryModal'); });
            document.getElementById('attr-cancel').addEventListener('click', function(){ closeModal('attributeQueryModal'); });

            // Populate layers in attribute query
            var attrLayerSelect = document.getElementById('attrLayer');
            var attrLayerMap = {};
            try{
                if(typeof overlaysTree !== 'undefined' && Array.isArray(overlaysTree)){
                    overlaysTree.forEach(function(item, idx){
                        if(item && item.layer && item.label){
                            var tmp = document.createElement('div'); tmp.innerHTML = item.label;
                            var text = tmp.textContent || tmp.innerText || ('Layer ' + idx);
                            var opt = document.createElement('option');
                            opt.value = idx;
                            opt.text = text;
                            attrLayerSelect.appendChild(opt);
                            attrLayerMap[idx] = item.layer;
                        }
                    });
                }
            }catch(e){ console.warn('populate attr layers failed', e); }

            // When layer selection changes, populate fields
            attrLayerSelect.addEventListener('change', function(){
                var idx = this.value;
                var filtersDiv = document.getElementById('attrFilters');
                if(!idx){ filtersDiv.style.display = 'none'; return; }

                var layer = attrLayerMap[idx];
                if(!layer){ filtersDiv.style.display = 'none'; return; }

                var fieldSelect = document.getElementById('attrField');
                fieldSelect.innerHTML = '<option value="">-- Choisir un champ --</option>';

                try{
                    var fields = {};
                    layer.eachLayer(function(feature){
                        if(feature.feature && feature.feature.properties){
                            Object.keys(feature.feature.properties).forEach(function(k){ fields[k] = true; });
                        }
                    });
                    Object.keys(fields).forEach(function(field){
                        var opt = document.createElement('option');
                        opt.value = field;
                        opt.text = field;
                        fieldSelect.appendChild(opt);
                    });
                    filtersDiv.style.display = 'block';
                }catch(e){ console.warn(e); filtersDiv.style.display = 'none'; }
            });

            // attr-submit handled later (runAttributeQuery wired after function definition)
        }

        // Update nav handlers to open modals
        var navSpatial = document.getElementById('nav-spatial'); 
        if(navSpatial){
            navSpatial.onclick = function(e){ 
                e.preventDefault(); 
                openModal('spatialQueryModal'); 
            };
        }
        var navAttribute = document.getElementById('nav-attribute'); 
        if(navAttribute){
            navAttribute.onclick = function(e){ 
                e.preventDefault(); 
                openModal('attributeQueryModal'); 
            };
        }

        // Close modal when clicking outside
        window.addEventListener('click', function(e){
            var spatialModal = document.getElementById('spatialQueryModal');
            var attrModal = document.getElementById('attributeQueryModal');
            if(e.target === spatialModal) closeModal('spatialQueryModal');
            if(e.target === attrModal) closeModal('attributeQueryModal');
        });

        // Replace visible text occurrences (e.g., "Canapés" -> "Couches")
        function replaceUIString(oldStr, newStr){
            try{
                var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                var node;
                while(node = walker.nextNode()){
                    if(node.nodeValue && node.nodeValue.indexOf(oldStr) !== -1){
                        node.nodeValue = node.nodeValue.replace(new RegExp(oldStr, 'g'), newStr);
                    }
                }
            }catch(e){ console.warn('replaceUIString failed', e); }
        }
        // Common variants
        replaceUIString('Canapés','Couches');
        replaceUIString('Canapes','Couches');
        replaceUIString('canapés','couches');

        // Results layer for queries
        var queryResults = L.featureGroup().addTo(map);

        // Build basemap controls on right panel and dynamic legend
        function buildBasemapControl(){
            var bmContainer = document.getElementById('basemapContainer');
            if(!bmContainer || typeof overlaysTree === 'undefined') return;
            bmContainer.innerHTML = '<div style="font-weight:700; margin-bottom:8px;">Fonds de carte</div>';
            overlaysTree.forEach(function(item, idx){
                if(item && item.radioGroup === 'bm'){
                    var tmp = document.createElement('div');
                    tmp.style.margin = '6px 0';
                    var input = document.createElement('input');
                    input.type = 'radio'; input.name = 'basemap'; input.value = idx;
                    if(map.hasLayer(item.layer)) input.checked = true;
                    input.addEventListener('change', function(){
                        // remove other basemaps
                        overlaysTree.forEach(function(it){ if(it && it.radioGroup === 'bm' && it.layer){ try{ map.removeLayer(it.layer); }catch(e){} } });
                        try{ map.addLayer(item.layer); }catch(e){}
                        updateLegend();
                    });
                    var label = document.createElement('label');
                    label.style.marginLeft = '6px';
                    // try to get readable text from label html
                    try{ var d = document.createElement('div'); d.innerHTML = item.label || ''; label.textContent = d.textContent || d.innerText || ('Basemap ' + idx); }catch(e){ label.textContent = ('Basemap ' + idx); }
                    tmp.appendChild(input); tmp.appendChild(label);
                    bmContainer.appendChild(tmp);
                }
            });
        }

        function updateLegend(){
            var legend = document.getElementById('legendContainer');
            if(!legend || typeof overlaysTree === 'undefined') return;
            legend.innerHTML = '<div style="font-weight:700; margin-bottom:8px;">Légende</div>';
            overlaysTree.forEach(function(item){
                if(!item || !item.label) return;
                var layer = item.layer;
                var visible = false;
                try{ if(layer && map.hasLayer(layer)) visible = true; }catch(e){}
                if(visible){
                    // extract first image src from label html
                    var div = document.createElement('div'); div.innerHTML = item.label;
                    var img = div.querySelector('img');
                    if(img){
                        var imgWrap = document.createElement('div');
                        imgWrap.style.display = 'flex'; imgWrap.style.alignItems = 'center'; imgWrap.style.gap = '8px'; imgWrap.style.marginBottom = '6px';
                        var thumb = document.createElement('img'); thumb.src = img.src; thumb.style.maxWidth = '40px'; thumb.style.height = 'auto';
                        var txt = document.createElement('div'); txt.innerHTML = div.textContent || div.innerText || '';
                        imgWrap.appendChild(thumb); imgWrap.appendChild(txt);
                        legend.appendChild(imgWrap);
                    } else {
                        // no img, show label text
                        var txt = document.createElement('div'); txt.style.marginBottom = '6px'; txt.textContent = (div.textContent||div.innerText||'');
                        legend.appendChild(txt);
                    }
                }
            });
        }

        // initial build
        try{ buildBasemapControl(); updateLegend(); }catch(e){}
        map.on('layeradd layerremove', function(){ try{ updateLegend(); }catch(e){} });

        // Basic attribute query implementation (filters and highlights)
        function runAttributeQuery(layer, field, op, value){
            queryResults.clearLayers();
            var matches = [];
            try{
                layer.eachLayer(function(l){
                    var props = l.feature && l.feature.properties ? l.feature.properties : null;
                    if(!props) return;
                    var v = props[field];
                    if(v === null || typeof v === 'undefined') return;
                    var ok = false;
                    var sval = String(v).toLowerCase();
                    var svalue = String(value).toLowerCase();
                    switch(op){
                        case '=': ok = (String(v) === value); break;
                        case '!=': ok = (String(v) !== value); break;
                        case '>': ok = Number(v) > Number(value); break;
                        case '<': ok = Number(v) < Number(value); break;
                        case 'contains': ok = (sval.indexOf(svalue) !== -1); break;
                        default: ok = (sval.indexOf(svalue) !== -1);
                    }
                    if(ok) matches.push(l.feature);
                });
            }catch(e){ console.warn('attribute query failed', e); }
            if(matches.length){
                var gj = L.geoJSON(matches, {style: function(){ return {color:'#ff0000', weight:3, fill:false}; }, pointToLayer: function(feature, latlng){ return L.circleMarker(latlng, {radius:6, color:'#ff0000'}); }});
                queryResults.addLayer(gj);
                map.fitBounds(gj.getBounds());
            } else {
                alert('Aucun résultat');
            }
        }

        // Basic spatial query: find features intersecting current map bounds
        function runSpatialBBoxQuery(selectedLayerIndices){
            queryResults.clearLayers();
            var bounds = map.getBounds();
            var results = [];
            try{
                selectedLayerIndices.forEach(function(idx){
                    var item = overlaysTree[idx];
                    if(!item || !item.layer) return;
                    item.layer.eachLayer(function(l){
                        try{
                            if(l.getBounds){
                                if(bounds.intersects(l.getBounds())) results.push(l.feature);
                            } else if(l.getLatLng){
                                if(bounds.contains(l.getLatLng())) results.push(l.feature);
                            }
                        }catch(e){}
                    });
                });
            }catch(e){ console.warn('spatial query failed', e); }
            if(results.length){
                var gj = L.geoJSON(results, {style: function(){ return {color:'#0078ff', weight:3, fill:false}; }, pointToLayer: function(feature, latlng){ return L.circleMarker(latlng, {radius:6, color:'#0078ff'}); }});
                queryResults.addLayer(gj);
                map.fitBounds(gj.getBounds());
            } else {
                alert('Aucun résultat dans la vue actuelle');
            }
        }

        // wire attribute modal submit to run query
        var attrSubmit = document.getElementById('attr-submit');
        if(attrSubmit){
            attrSubmit.addEventListener('click', function(e){
                var layerIdx = document.getElementById('attrLayer').value;
                var field = document.getElementById('attrField').value;
                var op = document.getElementById('attrOperator').value;
                var value = document.getElementById('attrValue').value;
                if(!layerIdx || !field || !value){ alert('Remplissez tous les champs'); return; }
                var layer = null;
                try{ layer = (typeof overlaysTree !== 'undefined') ? overlaysTree[layerIdx].layer : null; }catch(e){}
                if(!layer){ alert('Couche introuvable'); return; }
                runAttributeQuery(layer, field, op, value);
            });
        }

        // wire spatial submit
        var spatialSubmitBtn = document.getElementById('spatial-submit');
        if(spatialSubmitBtn){
            spatialSubmitBtn.addEventListener('click', function(){
                var selected = [];
                document.querySelectorAll('#spatialLayers input:checked').forEach(function(cb){ selected.push(cb.value); });
                if(!selected.length){ alert('Choisissez au moins une couche'); return; }
                runSpatialBBoxQuery(selected);
            });
        }
    }
})();
