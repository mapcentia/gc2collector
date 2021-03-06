/*global Ext:false */
/*global $:false */
/*global OpenLayers:false */
/*global GeoExt:false */
/*global mygeocloud_ol:false */
/*global attributeForm:false */
/*global geocloud:false */
/*global gc2i18n:false */


// In the following line, you should include the prefixes of implementations you want to test.
window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;

if (!window.indexedDB) {
    window.alert("Your browser doesn't support a stable version of IndexedDB. This app depend on the HTML5 feature.");
}

var indexedDb, request = window.indexedDB.open("gc2", 4);

request.onerror = function (event) {
    console.log(event)
    alert("Database error: " + event.target.errorCode);
};
request.onsuccess = function (event) {
    indexedDb = event.target.result;

};

request.onupgradeneeded = function (event) {
    var db = event.target.result,
        objectStore = db.createObjectStore("transactions", {autoIncrement: true});
    objectStore.createIndex("db", "db", {unique: false});
    objectStore.createIndex("schema", "schema", {unique: false});
    objectStore.createIndex("table", "table", {unique: false});
    objectStore.createIndex("synced", "synced", {unique: false});
};

function getTransactionStore() {
    return indexedDb.transaction(["transactions"], "readwrite").objectStore("transactions");
}


OpenLayers.IMAGE_RELOAD_ATTEMPTS = 3;
Ext.BLANK_IMAGE_URL = "js/ext/resources/images/default/s.gif";
Ext.QuickTips.init();

Ext.Ajax.withCredentials = true;
var App = new Ext.App({}), screenName, subUser, schema, cloud, gc2, layer, grid, store, map, wfsTools, viewport,
    drawControl, gridPanel, modifyControl, tree, loadTree, layerBeingEditing,
    layerBeingEditingGeomField, saveStrategy, getMetaData, extentRestrictLayer, currentId, qstore = [],
    queryWin, tbar, quickDrawMode, schemasStore, notSyncedStore, syncedStore, createLayer, offline = false,
    session, localStoreKey, host = "", initExtent = null;

$(document).ready(function () {
    'use strict';
    var bl = null, vArr1, vArr2, altId, lName, LayerNodeUI, layers = {}, sketchSymbolizers, currentActiveIndex, cards,
        navHandler, cardSwitch, setState, loadArcivedData, syncTransactions, deleteSyncedTransactions, metaData, metaDataKeys = [],
        metaDataKeysTitle = [], metaDataRealKeys = [], extent = null, gc2, clicktimer, getConnectionInfo, online;

    getConnectionInfo = function (cb) {
        var d = new Date();
        var freshUrl = 'online.txt?brk=' + d.getTime();

        $.ajax({
            url: freshUrl,
            type: 'GET',
            success: function (response) {
                if (response === "0") {
                    online = false;
                    Ext.getCmp("connection-box").body.dom.innerHTML = 'Offline';
                    cb("0");
                } else {
                    online = true;
                    Ext.getCmp("connection-box").body.dom.innerHTML = 'Online';
                    var checkUploadSpeed = function (iterations) {
                        var average = 0,
                            index = 0
                        check();
                        function check() {
                            var startTime,
                                speed = 0;
                            $(".fa-spin").show();
                            startTime = new Date();

                            $.ajax({
                                url: '?cache=' + Math.floor(Math.random() * 10000), //prevent url cache
                                type: 'POST',
                                data: getRandomString(0.1), //1 meg POST size handled by all servers
                                timeout: 10000,
                                success: function () {
                                    speed = Math.round(1024 / ( ( new Date() - startTime ) / 1000 ));
                                    average == 0
                                        ? average = speed
                                        : average = Math.round(( average + speed ) / 2);
                                    cb(speed, average);
                                    $(".fa-spin").hide();
                                },
                                error: function(){
                                    $(".fa-spin").hide();
                                    cb(1, 1);
                                },
                            })
                        };

                        function getRandomString(sizeInMb) {
                            var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()_+`-=[]\{}|;':,./<>?", //random data prevents gzip effect
                                iterations = sizeInMb * 1024 * 1024, //get byte count
                                result = '';
                            for (var index = 0; index < iterations; index++) {
                                result += chars.charAt(Math.floor(Math.random() * chars.length));
                            }
                            return result;
                        };
                    };
                    checkUploadSpeed(1);
                }
                console.log(online);
            }
        });
    }
    var deafaultCb = function (speed, average, i) {
        var txt = '' +
            'speed: ' + (speed === 1 ? 'timeout' : speed + 'kbs') + '<br>';
        //'average: ' + average + 'kbs';
        Ext.getCmp("speed-box").body.dom.innerHTML = txt;

    }
    getConnectionInfo(deafaultCb);

    cloud = new mygeocloud_ol.map(null, screenName, {
        controls: [
            new OpenLayers.Control.Navigation({
                //zoomBoxEnabled: true
            }),
            new OpenLayers.Control.Zoom(),
            new OpenLayers.Control.Attribution()
        ],
        restrictedExtent: null
    });
    map = cloud.map;
    gc2 = new geocloud.map({});
    gc2.map = map;
    gc2.on("dblclick", function (e) {
        clicktimer = undefined;
    });

    queryWin = new Ext.Window({
        title: "Query result",
        modal: true,
        border: false,
        layout: 'fit',
        width: 100,
        height: 100,
        closeAction: 'hide',
        plain: true,
        listeners: {
            hide: {
                fn: function (el, e) {
                    Ext.iterate(qstore, function (v) {
                        v.reset();
                    });
                }
            },
            afterrender: {
                fn: function (win) {
                    win.setHeight($(window).height() - 40);
                    win.setWidth($(window).width() - 40);
                    win.center();
                },
                single: true
            }
        },
        items: [
            new Ext.TabPanel({
                activeTab: 0,
                frame: false,
                id: "queryTabs"
            })
        ]
    });
    gc2.on("click", function (e) {
        var layers, count = 0, hit = false, event = new geocloud.clickEvent(e, cloud), distance, db = screenName;
        if (clicktimer) {
            clearTimeout(clicktimer);
        } else {
            clicktimer = setTimeout(function (e) {
                clicktimer = undefined;
                var coords = event.getCoordinate();
                $.each(qstore, function (index, st) {
                    try {
                        st.reset();
                        gc2.removeGeoJsonStore(st);
                    } catch (e) {

                    }
                });
                layers = gc2.getVisibleLayers().split(";");
                Ext.getCmp("queryTabs").removeAll();
                $.each(layers, function (index, value) {
                    var isEmpty = true;
                    var srid = metaDataKeys[value.split(".")[1]].srid;
                    var pkey = metaDataKeys[value.split(".")[1]].pkey;
                    var geoField = metaDataKeys[value.split(".")[1]].f_geometry_column;
                    var geoType = metaDataKeys[value.split(".")[1]].type;
                    var layerTitel = metaDataKeys[value.split(".")[1]].f_table_name;
                    var table = metaDataKeys[value.split(".")[1]].f_table_schema + "." + metaDataKeys[value.split(".")[1]].f_table_name;
                    var versioning = metaDataKeys[value.split(".")[1]].versioning;
                    if (geoType !== "POLYGON" && geoType !== "MULTIPOLYGON") {
                        var res = [156543.033928, 78271.516964, 39135.758482, 19567.879241, 9783.9396205,
                            4891.96981025, 2445.98490513, 1222.99245256, 611.496226281, 305.748113141, 152.87405657,
                            76.4370282852, 38.2185141426, 19.1092570713, 9.55462853565, 4.77731426782, 2.38865713391,
                            1.19432856696, 0.597164283478, 0.298582141739, 0.149291];
                        distance = 20 * res[cloud.getZoom()];
                    }
                    qstore[index] = new geocloud.sqlStore({
                        db: db,
                        id: index,
                        styleMap: new OpenLayers.StyleMap({
                            "default": new OpenLayers.Style({
                                    fillColor: "#000000",
                                    fillOpacity: 0.0,
                                    pointRadius: 8,
                                    strokeColor: "#00FF00",
                                    strokeWidth: 3,
                                    strokeOpacity: 0.7,
                                    graphicZIndex: 3
                                }
                            )
                        }),
                        onLoad: function () {
                            var layerObj = qstore[this.id], out = [], source = {}, pkeyValue;
                            isEmpty = layerObj.isEmpty();
                            if ((!isEmpty)) {
                                queryWin.show();
                                $.each(layerObj.geoJSON.features, function (i, feature) {
                                    $.each(feature.properties, function (name, property) {
                                        out.push([name, 0, name, property]);
                                    });
                                    out.sort(function (a, b) {
                                        return a[1] - b[1];
                                    });
                                    $.each(out, function (name, property) {
                                        if (property[2] === pkey) {
                                            pkeyValue = property[3];
                                        }
                                        source[property[2]] = property[3];
                                    });
                                    out = [];
                                });
                                Ext.getCmp("queryTabs").add(
                                    {
                                        title: layerTitel,
                                        layout: "fit",
                                        border: false,
                                        listeners: {
                                            activate: function (e) {
                                                // Add touch to buttons.
                                                addTouch();
                                            }
                                        },
                                        items: [
                                            {
                                                xtype: "panel",
                                                layout: "fit",
                                                id: layerTitel,
                                                border: false,
                                                tbar: [
                                                    {
                                                        text: "<i class='fa fa-edit'></i> Edit feature #" + pkeyValue,
                                                        handler: function () {
                                                            if (geoType === "GEOMETRY" || geoType === "RASTER") {
                                                                alert(__("The layer has no geometry type. Set it in GC2 Admin"));
                                                                return false;
                                                            }
                                                            else {
                                                                var filter = new OpenLayers.Filter.Comparison({
                                                                    type: OpenLayers.Filter.Comparison.EQUAL_TO,
                                                                    property: "\"" + pkey + "\"",
                                                                    value: pkeyValue
                                                                });
                                                                attributeForm.init(table, geoField);
                                                                var activeTab = Ext.getCmp("mainTabs").getActiveTab();
                                                                Ext.getCmp("mainTabs").activate(2);
                                                                Ext.getCmp("attpanel").add(attributeForm.form);
                                                                Ext.getCmp("attpanel").doLayout();
                                                                Ext.getCmp("mainTabs").activate(activeTab);
                                                                // Add touch event to buttons
                                                                attributeForm.form.disable();
                                                                startWfsEdition(table, geoField, filter, true);
                                                                Ext.iterate(qstore, function (v) {
                                                                    v.reset();
                                                                });
                                                                queryWin.hide();
                                                            }
                                                        }
                                                    }
                                                ],
                                                items: [
                                                    new Ext.grid.PropertyGrid({
                                                        autoHeight: false,
                                                        border: false,
                                                        startEditing: Ext.emptyFn,
                                                        source: source
                                                    })
                                                ]
                                            }
                                        ]
                                    }
                                );


                                hit = true;
                            }
                            if (!hit) {
                                try {
                                    queryWin.hide();
                                }
                                catch (e) {
                                }
                            }
                            count++;
                            Ext.getCmp("queryTabs").activate(0);
                        }
                    });
                    gc2.addGeoJsonStore(qstore[index]);
                    var sql, f_geometry_column = metaDataKeys[value.split(".")[1]].f_geometry_column;
                    if (geoType !== "POLYGON" && geoType !== "MULTIPOLYGON") {
                        sql = "SELECT * FROM " + value + " WHERE round(ST_Distance(ST_Transform(\"" + f_geometry_column + "\",3857), ST_GeomFromText('POINT(" + coords.x + " " + coords.y + ")',3857))) < " + distance;
                        if (versioning) {
                            sql = sql + " AND gc2_version_end_date IS NULL";
                        }
                        sql = sql + " ORDER BY round(ST_Distance(ST_Transform(\"" + f_geometry_column + "\",3857), ST_GeomFromText('POINT(" + coords.x + " " + coords.y + ")',3857)))";
                    }
                    else {
                        sql = "SELECT * FROM " + value + " WHERE ST_Intersects(ST_Transform(ST_geomfromtext('POINT(" + coords.x + " " + coords.y + ")',900913)," + srid + "),\"" + f_geometry_column + "\")";
                        if (versioning) {
                            sql = sql + " AND gc2_version_end_date IS NULL";
                        }

                    }
                    sql = sql + " LIMIT 1";
                    qstore[index].sql = sql;
                    qstore[index].load();
                });
            }, 250);
        }
    });
    if (typeof window.setBaseLayersCollector !== 'object') {
        window.setBaseLayersCollector = [
            {"id": "mapQuestOSM", "name": "MapQuset OSM"},
            {"id": "osm", "name": "OSM"}
        ];
    }
    cloud.bingApiKey = window.bingApiKey;
    cloud.digitalGlobeKey = window.digitalGlobeKey;
    window.setBaseLayersCollector = window.setBaseLayersCollector.reverse();

    for (var i = 0; i < window.setBaseLayersCollector.length; i++) {
        if (typeof window.setBaseLayersCollector[i].restrictTo === "undefined" || window.setBaseLayersCollector[i].restrictTo.indexOf(schema) > -1) {
            // Local base layer
            if (typeof window.setBaseLayersCollector[i].db !== "undefined") {
                altId = window.setBaseLayersCollector[i].id + window.setBaseLayersCollector[i].name;
                lName = window.setBaseLayersCollector[i].name;
            }
            bl = cloud.addBaseLayer(window.setBaseLayersCollector[i].id, window.setBaseLayersCollector[i].db, altId, lName);
        }
    }
    if (bl !== null) {
        cloud.setBaseLayer(bl);
    }
    LayerNodeUI = Ext.extend(GeoExt.tree.LayerNodeUI, new GeoExt.tree.TreeNodeUIEventMixin());

    loadTree = function (meta, settings) {
        var treeConfig = [
            {
                id: "baselayers",
                nodeType: "gx_baselayercontainer",
                singleClickExpand: true
            }
        ], setMapExtent = function (settings) {
            if (typeof settings.extents !== "undefined") {
                if (settings.extents[schema] !== undefined) {
                    cloud.map.zoomToExtent(settings.extents[schema], false);
                }
            }
            if (typeof settings.extentrestricts !== "undefined") {
                if (settings.extentrestricts[schema] !== undefined && settings.extentrestricts[schema] !== null) {
                    extentRestrictLayer.addFeatures(new OpenLayers.Feature.Vector(OpenLayers.Bounds.fromArray(settings.extentrestricts[schema]).toGeometry()));
                }
            }
        };
        var createTree = function (response) {
            var groups = [], isBaseLayer;
            if (response.data !== undefined) {
                metaData = response;
                for (var i = 0; i < metaData.data.length; i++) {
                    metaDataKeys[metaData.data[i].f_table_name] = metaData.data[i];
                    if (!metaData.data[i].f_table_title) {
                        metaData.data[i].f_table_title = metaData.data[i].f_table_name;
                    }
                    metaDataKeysTitle[metaData.data[i].f_table_title] = metaData.data[i];
                    groups[i] = response.data[i].layergroup;
                    metaDataRealKeys[response.data[i]._key_] = response.data[i];// Holds the layer extents
                }
                var arr = array_unique(groups);
                for (var u = 0; u < response.data.length; ++u) {
                    if (response.data[u].baselayer) {
                        isBaseLayer = true;
                    } else {
                        isBaseLayer = false;
                    }
                    // Try to remove layer before adding it
                    try {
                        cloud.removeTileLayerByName([
                            [response.data[u].f_table_schema + "." + response.data[u].f_table_name]
                        ]);
                    }
                    catch (e) {
                    }
                    layers[[response.data[u].f_table_schema + "." + response.data[u].f_table_name]] = cloud.addTileLayers([response.data[u].f_table_schema + "." + response.data[u].f_table_name], {
                        db: screenName,
                        singleTile: false,
                        visibility: false,
                        wrapDateLine: false,
                        tileCached: true,
                        displayInLayerSwitcher: true,
                        name: response.data[u].f_table_schema + "." + response.data[u].f_table_name
                    });
                }
                for (i = 0; i < arr.length; ++i) {
                    var l = [], id;
                    for (u = 0; u < response.data.length; ++u) {
                        if (response.data[u].layergroup === arr[i]) {
                            id = response.data[u].f_table_schema + "." + response.data[u].f_table_name + "." + response.data[u].f_geometry_column;
                            l.push({
                                text: ((response.data[u].f_table_title === null || response.data[u].f_table_title === "") ? response.data[u].f_table_name : response.data[u].f_table_title) + " <span style='float:right' class='leaf-tools' id='" + id.split('.').join('-') + "'></span>",
                                id: id,
                                leaf: true,
                                checked: false,
                                geomField: response.data[u].f_geometry_column,
                                geomType: response.data[u].type
                            });
                        }
                    }
                    treeConfig.push({
                        text: arr[i],
                        isLeaf: false,
                        singleClickExpand: true,
                        expanded: false,
                        children: l.reverse()
                    });
                }
            }
            treeConfig.push(treeConfig.shift());
            // create the tree with the configuration from above
            tree = new Ext.tree.TreePanel({
                id: "tree",
                border: false,
                region: "center",
                split: true,
                autoScroll: true,
                bodyStyle: 'padding: 3px',
                root: {
                    text: 'Ext JS',
                    children: Ext.decode(new OpenLayers.Format.JSON().write(treeConfig.reverse(), true)),
                    id: 'source'
                },
                loader: new Ext.tree.TreeLoader({
                    applyLoader: false,
                    uiProviders: {
                        "layernodeui": LayerNodeUI
                    }
                }),
                listeners: {
                    click: {
                        fn: function (e) {
                            var id = e.id.split('.').join('-'), load = function () {
                                if (e.leaf === true && e.parentNode.id !== "baselayers") {
                                    //window.parent.onEditWMSClasses(e.id);
                                }
                            };
                            try {
                                stopEdit();
                            }
                            catch (error) {
                            }
                            if (currentId !== e.id) {
                                /*if (window.parent.Ext.getCmp("layerStylePanel").collapsed) {
                                 window.parent.Ext.getCmp("layerStylePanel").expand(false);
                                 load();
                                 window.parent.Ext.getCmp("layerStylePanel").collapse(false);
                                 } else {
                                 load();
                                 }*/
                            }
                            if (e.leaf === true && e.parentNode.id !== "baselayers") {
                                Ext.getCmp('editlayerbutton').setDisabled(offline ? true : false);
                                Ext.getCmp('quickdrawbutton').setDisabled(false);
                            } else {
                                Ext.getCmp('editlayerbutton').setDisabled(true);
                                Ext.getCmp('quickdrawbutton').setDisabled(true);
                            }
                            if (typeof filter.win !== "undefined") {
                                if (typeof  filter.win.hide !== "undefined") {
                                    filter.win.hide();
                                }
                                filter.win = false;
                            }
                            $(".leaf-tools").empty();
                            $("#" + id).html("<i class='fa fa-arrows-alt' style='cursor:pointer' id='ext-" + id + "'></i>");
                            currentId = e.id;
                            $("#style-" + id).on("click", function () {
                                window.parent.Ext.getCmp("layerStylePanel").expand(true);
                            });
                            $("#ext-" + id).on("click", function () {
                                if (metaDataRealKeys[e.id].type === "RASTER") {
                                    window.parent.App.setAlert(App.STATUS_NOTICE, __('You can only zoom to vector layers.'));
                                    return false;
                                }
                                Ext.Ajax.request({
                                    url: host + '/api/v1/extent/' + screenName + '/' + e.id + '/900913',
                                    method: 'get',
                                    headers: {
                                        'Content-Type': 'application/json; charset=utf-8'
                                    },
                                    success: function (response) {
                                        var ext = Ext.decode(response.responseText).extent;
                                        cloud.map.zoomToExtent([ext.xmin, ext.ymin, ext.xmax, ext.ymax]);
                                    },
                                    failure: function (response) {
                                        alert(__(Ext.decode(response.responseText).message));
                                    }
                                });
                            });
                            $(".leaf-tools").on('touchstart', function (e) {
                                $(this).css("background-color", "#bbb");
                            }).on('touchend', function (e) {
                                $(this).css("background-color", "inherit");
                            });
                        }
                    }
                },
                rootVisible: false,
                lines: false
            });
            tree.on("checkchange", function (node, checked) {
                if (node.lastChild === null && node.parentNode.id !== "baselayers") {
                    // layer id are still only schema.table in map file
                    var layerId = node.id.split(".")[0] + "." + node.id.split(".")[1];
                    if (checked) {
                        layers[layerId][0].setVisibility(true);
                    } else {
                        layers[layerId][0].setVisibility(false);
                    }
                }
            });


            Ext.getCmp("mainTabs").activate(0);
            Ext.getCmp("mainTabs").activate(1);
            Ext.getCmp("mainTabs").activate(2);
            Ext.getCmp("mainTabs").activate(3);
            Ext.getCmp("mainTabs").activate(0);
            var west = Ext.getCmp("treepanel");
            west.remove(tree);
            west.add(tree);
            west.doLayout();

            // Last we add the restricted area layer.
            extentRestrictLayer = new OpenLayers.Layer.Vector("extentRestrictLayer", {
                styleMap: new OpenLayers.StyleMap({
                    "default": new OpenLayers.Style({
                        fillColor: "#000000",
                        fillOpacity: 0.0,
                        pointRadius: 5,
                        strokeColor: "#ff0000",
                        strokeWidth: 2,
                        strokeOpacity: 0.7,
                        graphicZIndex: 1
                    })
                })
            });
            /*if (window.parent.extentRestricted) {
             extentRestrictLayer.addFeatures(new OpenLayers.Feature.Vector(OpenLayers.Bounds.fromArray(window.parent.settings.extentrestricts[schema]).toGeometry()));
             }*/
            map.addLayers([extentRestrictLayer]);


        };

        if (meta) {
            createTree(meta);
        } else {
            $.ajax({
                url: host + '/api/v1/meta/' + screenName + '/' + schema,
                dataType: 'json',
                type: 'GET',
                success: function (response) {
                    localStorage.setItem("meta." + host + "." + localStoreKey + "." + schema, JSON.stringify(response));
                    createTree(response);
                }
            });
        }
        if (settings) {
            setMapExtent(settings);
        } else {
            $.ajax({
                url: '/controllers/setting',
                dataType: 'json',
                type: 'GET',

                success: function (data) {
                    var settings = data.data;
                    setMapExtent(settings);
                    settings.api_key = null;
                    settings.pw = null;
                    settings.api_key_subuser = null;
                    settings.pw_subuser = null;
                    localStorage.setItem("settings." + host + "." + localStoreKey + "." + schema, JSON.stringify(settings));
                }
            });
        }
    };
    wfsTools = [
        new GeoExt.Action({
            control: drawControl,
            text: "<i class='fa fa-pencil'></i> " + __(""),
            id: "editcreatebutton",
            disabled: true,
            enableToggle: true
        }),
        '-',
        {
            text: "<i class='fa fa-cut'></i> " + __(""),
            id: "editdeletebutton",
            disabled: true,
            handler: function () {
                gridPanel.getSelectionModel().each(function (rec) {
                    var feature = rec.get("feature");
                    modifyControl.unselectFeature(feature);
                    gridPanel.store.remove(rec);
                    if (feature.state !== OpenLayers.State.INSERT) {
                        feature.state = OpenLayers.State.DELETE;
                        layer.addFeatures([feature]);
                    }

                });
            }
        },
        '-',
        {
            text: "<i class='fa fa-stop-circle'></i> " + __(""),
            disabled: true,
            id: "editstopbutton",
            handler: function () {
                if (confirm(__("All not saved sketches will be deleted. Continue?"))) {
                    stopEdit();
                } else {
                    return false;
                }
            }
        },
        '->',
        {
            text: "<i class='fa fa-check'></i> " + __(""),
            disabled: true,
            id: "editsavebutton",
            handler: function () {
                if (attributeForm.form.form.isValid()) {
                    if (modifyControl.feature) {
                        modifyControl.selectControl.unselectAll();
                    }
                    if (offline === false) {
                        var box = Ext.MessageBox.show({
                            title: 'Checking speed',
                            msg: "<i class=\"big fa fa-cog fa-spin\"></i>",
                            width: (Ext.getBody().getViewSize().width - 55),
                            height: 300,
                            //icon: Ext.MessageBox.QUESTION,
                            closable: false
                        });
                        getConnectionInfo(function (speed, average, i) {
                            if (speed < 200) {
                                box.setIcon(Ext.MessageBox.ERROR);
                                box.updateText("Bad connection. The new record is archived. Sync up when you've a better connection.")
                                offline = true;
                                setTimeout(function () {
                                    box.hide()
                                }, 4000)
                            } else {
                                box.setIcon(Ext.MessageBox.INFO);
                                box.updateText("Good connection. The record is being send.")
                                setTimeout(function () {
                                    box.hide()
                                }, 3000)
                            }
                            store.commitChanges();
                            saveStrategy.save();
                            offline = false;
                        });
                    } else {
                        store.commitChanges();
                        saveStrategy.save();
                    }
                } else {
                    Ext.getCmp("mainTabs").activate(2);
                }
            }
        },
        '-',
        {
            text: __("Finish"),
            id: "finishsketchbutton",
            disabled: true,
            handler: function (e) {
                drawControl.finishSketch();
                e.setDisabled(true);
            }
        },
        '-',
        {
            text: "<i class='fa fa-location-arrow'></i> " + __(" "),
            handler: function () {
                cloud.locate();
            }
        }

    ];

    sketchSymbolizers = {
        "Point": {
            pointRadius: 4,
            graphicName: "square",
            fillColor: "white",
            fillOpacity: 1,
            strokeWidth: 1,
            strokeOpacity: 1,
            strokeColor: "#333333"
        },
        "Line": {
            strokeWidth: 3,
            strokeOpacity: 1,
            strokeColor: "#666666",
            strokeDashstyle: "dash"
        },
        "Polygon": {
            strokeWidth: 2,
            strokeOpacity: 1,
            strokeColor: "#666666",
            fillColor: "white",
            fillOpacity: 0.3
        }
    };
    navHandler = function (direction) {
        var w = Ext.getCmp('cards');
        var activeIndex = w.items.indexOf(w.getLayout().activeItem) + direction;
        cards.setActiveItem(activeIndex);
    };
    schemasStore = new Ext.data.Store({
        reader: new Ext.data.JsonReader({
            successProperty: 'success',
            root: 'data'
        }, [
            {
                "name": "schema"
            }
        ]),
        url: '/controllers/database/schemas',
        listeners: {
            load: function (e) {
                var data = [];
                e.data.each(function (item, index) {
                    data.push(item.json);
                });
                localStorage.setItem("schemas." + host + "." + localStoreKey, JSON.stringify(data));
            }
        }
    });

    notSyncedStore = new Ext.data.JsonStore({
        fields: ['id', 'db', 'schema', 'table', 'status']
    });
    syncedStore = new Ext.data.JsonStore({
        fields: ['id', 'db', 'schema', 'table']
    });

    cardSwitch = function () {
        var w = Ext.getCmp('cards');
        var activeIndex = w.items.indexOf(w.getLayout().activeItem);
        var mp = Ext.getCmp("move-prev");
        var mn = Ext.getCmp("move-next");
        switch (activeIndex) {
            case 0:
                mp.disable();
                mn.enable();
                mp.setText("");
                mn.setText("Login >");
                break;
            case 1:
                mp.enable();
                if (session) {
                    mn.enable();
                } else {
                    mn.disable();
                }
                mp.setText("< Archive");
                mn.setText("Schema >");
                break;
            case 2:
                mp.enable();
                if (schema) {
                    mn.enable();
                } else {
                    mn.disable();
                }
                mp.setText("< Login");
                mn.setText("Editor >");
                break;
            case 3:
                mp.enable();
                mn.disable();
                mp.setText("< Schema");
                mn.setText("");
                break;

        }
    };
    viewport = new Ext.Viewport({
        layout: 'border',
        listeners: {
            afterlayout: function () {
                cards = Ext.getCmp("cards").layout;
            }
        },
        items: [
            {
                region: "center",
                layout: "fit",
                border: false,
                items: [
                    new Ext.Panel({
                        layout: "card",
                        id: "cards",
                        deferredRender: true,
                        activeItem: 0,
                        listeners: {
                            afterlayout: function () {
                                tbar = Ext.getCmp("cards").getTopToolbar();
                            },
                            resize: function () {
                                var w = Ext.getCmp('cards');
                                currentActiveIndex = w.items.indexOf(w.getLayout().activeItem);
                            }
                        },
                        tbar: [
                            {
                                xtype: 'tbtext',
                                text: ' '
                            }
                        ],
                        bbar: [
                            {
                                id: 'move-prev',
                                text: 'Back',
                                handler: navHandler.createDelegate(this, [-1])
                            },
                            '->',
                            {
                                id: 'move-next',
                                text: 'Next',
                                handler: navHandler.createDelegate(this, [1])

                            }
                        ],
                        items: [
                            new Ext.TabPanel({
                                activeTab: 0,
                                border: false,
                                listeners: {
                                    activate: function (e) {
                                        cardSwitch();
                                    }
                                },
                                items: [
                                    new Ext.grid.GridPanel({
                                        id: "notSynced",
                                        title: __("Not synced"),
                                        border: false,
                                        viewConfig: {
                                            forceFit: true
                                        },
                                        tbar: [
                                            {
                                                text: "<i class='fa fa-refresh'></i> " + __("Reload"),
                                                handler: function () {
                                                    loadArcivedData();
                                                }
                                            },
                                            '->',
                                            {
                                                text: "<i class='fa fa-arrow-circle-up'></i> " + __("Sync"),
                                                handler: function () {
                                                    syncTransactions();
                                                }
                                            }
                                        ],
                                        store: notSyncedStore,
                                        cm: new Ext.grid.ColumnModel({
                                            defaults: {
                                                sortable: true,
                                                editor: {
                                                    xtype: "textfield"
                                                },
                                                menuDisabled: true
                                            },
                                            columns: [
                                                {
                                                    header: __("Id"),
                                                    dataIndex: "id",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                }, {
                                                    header: __("Db"),
                                                    dataIndex: "db",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                }, {
                                                    header: __("Schema"),
                                                    dataIndex: "schema",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                }, {
                                                    header: __("Table"),
                                                    dataIndex: "table",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                },
                                                {
                                                    header: __("Sync status"),
                                                    dataIndex: "status",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                }]


                                        })
                                    }),
                                    new Ext.grid.GridPanel({
                                        id: "synced",
                                        title: __("Synced"),
                                        border: false,
                                        viewConfig: {
                                            forceFit: true
                                        },
                                        tbar: [
                                            {
                                                text: "<i class='fa fa-trash'></i> " + __("Delete all"),
                                                handler: function () {
                                                    if (confirm(__("You'll delete all synced records."))) {
                                                        deleteSyncedTransactions();
                                                    } else {
                                                        return false;
                                                    }
                                                }
                                            }
                                        ],
                                        store: syncedStore,
                                        cm: new Ext.grid.ColumnModel({
                                            defaults: {
                                                sortable: true,
                                                editor: {
                                                    xtype: "textfield"
                                                },
                                                menuDisabled: true
                                            },
                                            columns: [
                                                {
                                                    header: __("Id"),
                                                    dataIndex: "id",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                }, {
                                                    header: __("Db"),
                                                    dataIndex: "db",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                }, {
                                                    header: __("Schema"),
                                                    dataIndex: "schema",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                }, {
                                                    header: __("Table"),
                                                    dataIndex: "table",
                                                    sortable: true,
                                                    width: 150,
                                                    flex: 1
                                                }]


                                        })
                                    })
                                ]
                            }),
                            new Ext.Panel({
                                listeners: {
                                    activate: function (e) {
                                        cardSwitch();
                                    }
                                },
                                border: false,
                                items: [{
                                    xtype: "form",
                                    id: 'loginForm',
                                    border: false,
                                    labelWidth: 90,
                                    bodyStyle: {
                                        padding: "10px"
                                    },
                                    items: [{
                                        xtype: 'textfield',
                                        name: 'u',
                                        emptyText: 'Name',
                                        fieldLabel: 'Database',
                                        allowBlank: false,
                                        id: "userField"
                                    }, {
                                        xtype: 'textfield',
                                        inputType: 'password',
                                        name: 'p',
                                        emptyText: 'Password',
                                        fieldLabel: 'Password'

                                    }],
                                    buttonAlign: "left",
                                    buttons: [
                                        {
                                            text: __('Online'),
                                            handler: function () {
                                                offline = false;
                                                if (Ext.getCmp("loginForm").form.isValid()) {
                                                    Ext.getCmp("loginForm").form.submit({
                                                        url: '/api/v1/session/start',
                                                        success: function (e, a) {
                                                            screenName = Ext.decode(a.response.responseText).screen_name;

                                                            subUser = Ext.decode(a.response.responseText).subuser;
                                                            localStoreKey = Ext.getCmp("userField").getValue();
                                                            localStorage.setItem("session." + host + "." + localStoreKey, a.response.responseText);

                                                            sessionStorage.setItem("offline", false);
                                                            sessionStorage.setItem("screenName", screenName);
                                                            sessionStorage.setItem("localStoreKey", localStoreKey);
                                                            sessionStorage.setItem("subUser", subUser);
                                                            sessionStorage.setItem("session", true);
                                                            cards.setActiveItem(2);
                                                            session = true;
                                                            setState();
                                                            schemasStore.load();
                                                        },
                                                        failure: function () {
                                                            alert("Could not log in. Check user name and password.");
                                                        }
                                                    });
                                                }
                                            }
                                        },
                                        {
                                            text: __('Offline'),
                                            handler: function () {
                                                offline = true;
                                                if (Ext.getCmp("loginForm").form.isValid()) {
                                                    localStoreKey = Ext.getCmp("userField").getValue();
                                                    var obj = localStorage.getItem("session." + host + "." + localStoreKey);
                                                    if (obj) {
                                                        console.log("BINGO");
                                                        cards.setActiveItem(2);
                                                        obj = JSON.parse(obj);
                                                        screenName = obj.screen_name;
                                                        subUser = obj.subuser;
                                                        sessionStorage.setItem("offline", true);
                                                        sessionStorage.setItem("screenName", screenName);
                                                        sessionStorage.setItem("localStoreKey", localStoreKey);
                                                        sessionStorage.setItem("subUser", subUser);
                                                        sessionStorage.setItem("session", true);
                                                        session = true;
                                                        setState();
                                                        schemasStore.loadData({
                                                            "success": true,
                                                            "data": JSON.parse(localStorage.getItem("schemas." + host + "." + Ext.getCmp("userField").getValue())),
                                                            "_execution_time": 0.019
                                                        });

                                                    } else {
                                                        alert("You've to login online first, before you can use offline mode.");
                                                        return;
                                                    }

                                                }
                                            }
                                        }
                                    ]
                                },
                                    {
                                        bodyStyle: 'padding: 10px 10px 0 10px;',
                                        border: false,
                                        items: [{
                                            xtype: 'fieldset',
                                            title: "Connection speed test <i class=\"small fa fa-cog fa-spin\"></i>",
                                            defaults: {
                                                style: {
                                                    font: "normal 16px 'Open Sans'"
                                                }
                                            },
                                            items: [{

                                                id: "connection-box",
                                                border: false,
                                                html: ""
                                            },
                                                {

                                                    id: "speed-box",
                                                    border: false,
                                                    html: ""
                                                }, {
                                                    xtype: "box",
                                                    height: 15
                                                },
                                                {
                                                    xtype: 'button',
                                                    text: __('Check'),
                                                    handler: function () {
                                                        getConnectionInfo(deafaultCb)
                                                    }
                                                }]
                                        }]
                                    }
                                ]
                            }),

                            new Ext.grid.GridPanel({
                                id: "schemaGrid",
                                border: false,
                                listeners: {
                                    activate: function (e) {
                                        cardSwitch();
                                    },
                                    click: {
                                        fn: function (e) {
                                            var record = Ext.getCmp("schemaGrid").getSelectionModel().getSelections();
                                            if (record.length === 0) {
                                                App.setAlert(App.STATUS_NOTICE, __("You've to select a layer"));
                                                return false;
                                            }
                                            schema = record[0].data.schema;
                                            sessionStorage.setItem("schema", schema);
                                            if (offline) {
                                                var response = JSON.parse(localStorage.getItem("meta." + host + "." + localStoreKey + "." + schema)),
                                                    settings = JSON.parse(localStorage.getItem("settings." + host + "." + localStoreKey + "." + schema));
                                                if (!response) {
                                                    alert("You've to start with the schema online, before you can use it in offline mode.");
                                                    return;
                                                } else {
                                                    loadTree(response, settings);
                                                }
                                            } else {
                                                loadTree(null);
                                            }
                                            cards.setActiveItem(3);
                                            setState();
                                        },
                                        scope: this
                                    }
                                },
                                viewConfig: {
                                    forceFit: true
                                },
                                sm: new Ext.grid.RowSelectionModel({
                                    singleSelect: true
                                }),
                                store: schemasStore,
                                cm: new Ext.grid.ColumnModel({
                                    defaults: {
                                        sortable: true,
                                        menuDisabled: true
                                    },
                                    columns: [
                                        {
                                            header: __("Select schema"),
                                            dataIndex: "schema",
                                            sortable: true
                                        }
                                    ]
                                })
                            }),
                            new Ext.TabPanel({
                                id: "mainTabs",
                                tabPosition: "top",
                                unstyled: true,
                                layoutOnTabChange: true,
                                activeTab: 0,
                                resizeTabs: true,
                                listeners: {
                                    activate: function (e) {
                                        cardSwitch();
                                    }
                                },
                                items: [
                                    new Ext.Panel({
                                        border: false,
                                        title: "Layers",
                                        tbar: [
                                            {
                                                text: "<i class='fa fa-pencil'></i> " + __("Start edit"),
                                                id: "editlayerbutton",
                                                disabled: true,
                                                handler: function (thisBtn, event) {
                                                    try {
                                                        stopEdit();
                                                    }
                                                    catch (e) {
                                                    }
                                                    try {
                                                        Ext.getCmp("loaddialog").remove(filter.queryPanel);
                                                    } catch (e) {
                                                    }
                                                    try {
                                                        filter.queryPanel.destroy();
                                                    } catch (e) {
                                                    }
                                                    try {
                                                        filter.queryPanel = undefined;

                                                    } catch (e) {
                                                    }


                                                    var node = tree.getSelectionModel().getSelectedNode();
                                                    var id = node.id.split(".");
                                                    var geomField = node.attributes.geomField;
                                                    var type = node.attributes.geomType;
                                                    attributeForm.init(id[0] + "." + id[1], geomField);
                                                    quickDrawMode = false;
                                                    if (type === "GEOMETRY" || type === "RASTER") {
                                                        alert(__("The layer has no geometry type. Set it in GC2 Admin"));
                                                    }
                                                    else {
                                                        var poll = function () {
                                                            if (typeof filter.win === "object") {
                                                                filter.win.show();
                                                                var activeTab = Ext.getCmp("mainTabs").getActiveTab();
                                                                Ext.getCmp("mainTabs").activate(2);
                                                                Ext.getCmp("attpanel").add(attributeForm.form);
                                                                Ext.getCmp("attpanel").doLayout();
                                                                Ext.getCmp("mainTabs").activate(activeTab);
                                                                // Add touch event to buttons
                                                                addTouch();
                                                                attributeForm.form.disable();
                                                            }
                                                            else {
                                                                setTimeout(poll, 10);
                                                            }
                                                        };
                                                        poll();
                                                    }
                                                }
                                            },
                                            {
                                                text: "<i class='fa fa-plus-square'></i> " + __("Add feature"),
                                                id: "quickdrawbutton",
                                                disabled: true,
                                                handler: function () {
                                                    quickDrawMode = true;
                                                    var node = tree.getSelectionModel().getSelectedNode();
                                                    var id = node.id.split(".");
                                                    var geomField = node.attributes.geomField;
                                                    var type = node.attributes.geomType;
                                                    if (type === "GEOMETRY" || type === "RASTER") {
                                                        alert(__("The layer has no geometry type. Set it in GC2 Admin"));

                                                        return false;
                                                    }
                                                    else {
                                                        var filter = new OpenLayers.Filter.Comparison({
                                                            type: OpenLayers.Filter.Comparison.EQUAL_TO,
                                                            property: "\"dummy\"",
                                                            value: "-1"
                                                        });
                                                        attributeForm.init(id[0] + "." + id[1], geomField);
                                                        Ext.getCmp("attpanel").add(attributeForm.form);
                                                        attributeForm.form.disable();
                                                        startWfsEdition(id[0] + "." + id[1], geomField, filter);
                                                    }
                                                }
                                            }],
                                        items: [
                                            new Ext.Panel({
                                                border: false,
                                                id: "treepanel",
                                                style: {
                                                    height: (Ext.getBody().getViewSize().height - 155) + "px",
                                                    overflow: "auto"
                                                },
                                                collapsible: false

                                            })
                                        ]
                                    }),
                                    {
                                        title: "Map",
                                        border: false,
                                        id: "mappanel",
                                        xtype: "gx_mappanel",
                                        map: map,
                                        zoom: 5,
                                        split: true,
                                        tbar: wfsTools
                                    },
                                    {
                                        title: "Attribut",
                                        id: "attpanel",
                                        layout: "fit",
                                        listeners: {
                                            deactivate: function (e) {
                                                try {
                                                    attributeForm.updateFeature();
                                                } catch (e) {
                                                }

                                            }
                                        }
                                    },
                                    {
                                        id: "attrtable",
                                        border: false,

                                        title: "Table",
                                        layout: "fit",
                                        contentEl: "instructions"
                                    }

                                ]
                            })
                        ]
                    })
                ]
            }
        ]
    });

    if (window.parent.initExtent !== null) {
        cloud.map.zoomToExtent(window.parent.initExtent, false);
    } else {
        cloud.map.zoomToMaxExtent();
    }

    setState = function () {
        if (session) {
            tbar.getComponent(0).setText((offline ? "Offline" : "Online") + " > " + (subUser ? subUser + "@" : "") + screenName + (schema ? " > " + schema : ""));
        } else {
            tbar.getComponent(0).setText("Select database and schema");
        }
    };
    var loadArcivedDataDone;
    loadArcivedData = function () {
        loadArcivedDataDone = false;
        vArr1 = [];
        vArr2 = [];
        getTransactionStore().openCursor().onsuccess = function (event) {
            var cursor = event.target.result;
            if (cursor) {
                if (typeof cursor.value.id === "undefined") {
                    cursor.value.id = cursor.key;
                }
                if (cursor.value.synced === 1) {
                    vArr1.push(cursor.value);
                } else if (cursor.value.synced === 2) {
                    vArr2.push(cursor.value);
                }
                cursor.continue();
            } else {
                notSyncedStore.loadData(vArr1);
                syncedStore.loadData(vArr2);
                loadArcivedDataDone = true;
            }
        };


    };
    setTimeout(function () {
        loadArcivedData();

    }, 1000);

    syncTransactions = function () {
        var i = 0, grid1 = Ext.getCmp("notSynced"), sm = grid1.getSelectionModel();
        loadArcivedData();
        (function poll() {
            if (loadArcivedDataDone) {
                (function iter() {
                    if (i === vArr1.length) {
                        loadArcivedData();
                        return true;
                    } else {
                        sm.selectRow(i);
                        sm.getSelected();

                        $.ajax({
                            url: vArr1[i].url,
                            data: vArr1[i].request,
                            type: 'POST',
                            contentType: "text/xml",
                            dataType: "text",
                            success: function () {
                                var objectStore = getTransactionStore();
                                var request = objectStore.get(vArr1[i].id);
                                request.onsuccess = function (event) {
                                    var data = request.result;
                                    data.id = vArr1[i].id;
                                    data.synced = 2;
                                    var requestUpdate = objectStore.add(data);
                                    var requestDelete = objectStore.delete(vArr1[i].id);
                                    requestDelete.onerror = function (event) {
                                        console.log("Update error");
                                    };
                                    requestDelete.onsuccess = function (event) {
                                        console.log("Update success");
                                        sm.getSelected().set("status", "Success");
                                        i = i + 1;
                                        iter();
                                    };
                                };
                            },
                            error: function (response) {
                                sm.getSelected().set("status", "Error");
                                i = i + 1;
                                iter();
                            }
                        });
                    }
                }());
            } else {
                setTimeout(function () {
                    poll();
                }, 100);
            }
        }());


    };
    deleteSyncedTransactions = function () {
        var objectStore = getTransactionStore();
        objectStore.openCursor().onsuccess = function (event) {
            var cursor = event.target.result;
            if (cursor) {
                if (cursor.value.synced === 2) {
                    cursor.delete();
                    console.log("Delete");
                }
                cursor.continue();
            }
            else {
                loadArcivedData();
            }
        };
    };

    // Set and check session when refreshing the browser
    session = sessionStorage.getItem("session");
    if (session) {
        Ext.getCmp("cards").layout.setActiveItem(3);
        screenName = sessionStorage.getItem("screenName");
        // subUser can both be boolean and string
        try {
            subUser = JSON.parse(sessionStorage.getItem("subUser"));
        } catch (e) {
            subUser = sessionStorage.getItem("subUser");
        }
        Ext.getCmp("userField").setValue(subUser ? subUser : screenName);
        schema = sessionStorage.getItem("schema");
        localStoreKey = sessionStorage.getItem("localStoreKey");
        offline = JSON.parse(sessionStorage.getItem("offline"));
        schemasStore.loadData({
            "success": true,
            "data": JSON.parse(localStorage.getItem("schemas." + host + "." + localStoreKey))
        });
        loadTree(
            JSON.parse(localStorage.getItem("meta." + host + "." + localStoreKey + "." + schema)),
            JSON.parse(localStorage.getItem("settings." + host + "." + localStoreKey + "." + schema))
        );
        setState();
    } else {
        Ext.getCmp("cards").layout.setActiveItem(1);
        setState();
    }

    // Add touch event to buttons
    addTouch();

});
function startWfsEdition(layerName, geomField, wfsFilter, single, timeSlice) {
    'use strict';
    var fieldsForStore, columnsForGrid, type, multi, handlerType, editable = true, sm, south = Ext.getCmp("attrtable"),
        singleEditing = single, createColumns, key;

    key = "table." + host + "." + localStoreKey + "." + layerName;
    layerBeingEditing = layerName.split(".")[1];
    layerBeingEditingGeomField = geomField;
    try {
        drawControl.deactivate();
        layer.removeAllFeatures();
        map.removeLayer(layer);
    } catch (e) {
    }
    try {
        south.remove(grid);
    } catch (e) {

    }
    createColumns = function () {
        var data = JSON.parse(localStorage.getItem(key)), response = data, validProperties = true, i;
        if (!response) {
            return;
        }
        fieldsForStore = response.forStore;
        columnsForGrid = response.forGrid;
        type = response.type;
        multi = response.multi;
        // We add an editor to the fields
        for (i in columnsForGrid) {
            columnsForGrid[i].editable = editable;
            if (columnsForGrid[i].typeObj !== undefined) {
                if (columnsForGrid[i].properties) {
                    try {
                        var json = Ext.decode(columnsForGrid[i].properties);
                        columnsForGrid[i].editor = new Ext.form.ComboBox({
                            store: Ext.decode(columnsForGrid[i].properties),
                            editable: true,
                            triggerAction: 'all'
                        });
                        validProperties = false;
                    }
                    catch (e) {
                        alert('There is invalid properties on field ' + columnsForGrid[i].dataIndex);
                    }
                } else if (columnsForGrid[i].typeObj.type === "int") {
                    columnsForGrid[i].editor = new Ext.form.NumberField({
                        decimalPrecision: 0,
                        decimalSeparator: '¤'// Some strange char nobody is using
                    });
                } else if (columnsForGrid[i].typeObj.type === "decimal") {
                    columnsForGrid[i].editor = new Ext.form.NumberField({
                        decimalPrecision: columnsForGrid[i].typeObj.scale,
                        decimalSeparator: '.'
                    });
                } else if (columnsForGrid[i].typeObj.type === "string") {
                    columnsForGrid[i].editor = new Ext.form.TextField();
                } else if (columnsForGrid[i].typeObj.type === "text") {
                    columnsForGrid[i].editor = new Ext.form.TextArea();
                }
            }
        }
    };
    createLayer = function () {
        if (type === "Point") {
            handlerType = OpenLayers.Handler.Point;
        }
        else if (type === "Polygon") {
            handlerType = OpenLayers.Handler.Polygon;
        }
        else if (type === "Path") {
            handlerType = OpenLayers.Handler.Path;
        }
        var rules = {
            rules: [
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.NOT_EQUAL_TO,
                        property: "gc2_version_end_date",
                        value: 'null'
                    }),
                    symbolizer: {
                        fillColor: "#FFFFFF",
                        fillOpacity: 0.5,
                        strokeColor: "#FF0000",
                        strokeWidth: 2,
                        strokeDashstyle: "dash",
                        strokeOpacity: 0.7,
                        graphicZIndex: 1
                    }
                }),
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.EQUAL_TO,
                        property: "gc2_version_end_date",
                        value: null
                    }),
                    symbolizer: {
                        fillColor: "#FFFFFF",
                        fillOpacity: 0.5,
                        strokeColor: "#00FF00",
                        strokeWidth: 3,
                        strokeOpacity: 0.7,
                        graphicZIndex: 3,
                        strokeDashstyle: "solid"
                    }
                })
            ]
        };

        var styleMap = new OpenLayers.StyleMap({
            "default": new OpenLayers.Style({
                    fillColor: "#000000",
                    fillOpacity: 0,
                    pointRadius: 12,
                    strokeColor: "#00FF00",
                    strokeWidth: 3,
                    strokeOpacity: 0.7,
                    graphicZIndex: 3

                },
                rules
            ),
            temporary: new OpenLayers.Style({
                    fillColor: "#FF0000",
                    fillOpacity: 0,
                    pointRadius: 12,
                    strokeColor: "#FF0000",
                    strokeWidth: 1,
                    strokeOpacity: 0.7,
                    graphicZIndex: 1
                }
            ),
            select: new OpenLayers.Style({
                    fillColor: "#00FF00",
                    fillOpacity: 0,
                    pointRadius: 20,
                    strokeColor: "#00FF00",
                    strokeWidth: 3,
                    strokeOpacity: 1,
                    graphicZIndex: 3
                }, rules
            )
        });

        layer = new OpenLayers.Layer.Vector("vector", {
            strategies: [new OpenLayers.Strategy.Fixed(), saveStrategy],
            protocol: new OpenLayers.Protocol.WFS.v1_0_0({
                url: host + "/wfs/" + (subUser ? subUser + "@" + screenName : screenName) + "/" + schema + "/900913" + (timeSlice ? "/" + timeSlice : "") + "?",
                version: "1.0.0",
                featureType: layerName.split(".")[1],
                featureNS: "http://mapcentia.com/" + screenName,
                featurePrefix: screenName,
                srsName: "EPSG:900913",
                geometryName: geomField, // must be dynamamic
                defaultFilter: wfsFilter
            }),
            styleMap: styleMap
        });
        map.addLayers([layer]);

        layer.events.register("loadend", layer, function () {
            var count = layer.features.length;
            window.parent.App.setAlert(App.STATUS_NOTICE, count + " features loaded");
            if (layer.features.length > 0) {
                //map.zoomToExtent(layer.getDataExtent());
            }
            if (singleEditing) {
                setTimeout(function () {
                    map.controls[map.controls.length - 1].selectControl.select(layer.features[0]);
                }, 600);
                singleEditing = false;
                Ext.getCmp('editcreatebutton').toggle(false);
            }
        });
        layer.events.register("loadstart", layer, function () {
            //App.setAlert(App.STATUS_OK, "Start loading...");
        });

        layer.events.register("sketchcomplete", layer, function () {
            Ext.getCmp("finishsketchbutton").setDisabled(true);
        });

        layer.events.register("sketchmodified", layer, function (e, f) {
            if (typeof e.feature.geometry.components !== "undefined") {
                if (handlerType === OpenLayers.Handler.Polygon && e.feature.geometry.components[0].components.length > 4) {
                    Ext.getCmp("finishsketchbutton").setDisabled(false);
                }
                else if (handlerType === OpenLayers.Handler.Path && e.feature.geometry.components.length > 2) {
                    Ext.getCmp("finishsketchbutton").setDisabled(false);
                } else {
                    Ext.getCmp("finishsketchbutton").setDisabled(true);
                }
            }
        });
        if (typeof handlerType === "undefined") {
            return;
        }
        drawControl = new OpenLayers.Control.DrawFeature(layer, handlerType, {
            featureAdded: function onInsert() {
                var pos = grid.getStore().getCount() - 1;
                grid.selModel.selectRow(pos);
            },
            handlerOptions: {
                multi: multi,
                handlerOptions: {
                    holeModifier: "altKey"
                }
            }
        });

        wfsTools[0].control = drawControl;
        Ext.iterate(qstore, function (v) {
            v.reset();
        });
        queryWin.hide();

        map.addControl(drawControl);

        modifyControl = new OpenLayers.Control.ModifyFeature(layer, {
            vertexRenderIntent: 'temporary',
            displayClass: 'olControlModifyFeature'
        });
        map.addControl(modifyControl);
        modifyControl.activate();

        sm = new GeoExt.grid.FeatureSelectionModel({
            selectControl: modifyControl.selectControl,
            singleSelect: true,
            listeners: {
                rowselect: function (sm, row, rec) {
                    attributeForm.form.enable();
                    try {
                        attributeForm.form.getForm().loadRecord(rec);
                    } catch (e) {
                    }
                },
                rowdeselect: function () {
                    attributeForm.form.disable();
                }
            }
        });

        store = new GeoExt.data.FeatureStore({
            proxy: new GeoExt.data.ProtocolProxy({
                protocol: layer.protocol
            }),
            fields: fieldsForStore,
            layer: layer,
            featureFilter: new OpenLayers.Filter({
                evaluate: function (feature) {
                    return feature.state !== OpenLayers.State.DELETE;
                }
            })
        });

        grid = new Ext.grid.EditorGridPanel({
            id: "gridpanel",
            region: "center",
            disabled: false,
            viewConfig: {
                forceFit: true
            },
            store: store,
            listeners: {
                afteredit: function (e) {
                    var feature = e.record.get("feature");
                    if (feature.state !== OpenLayers.State.INSERT) {
                        feature.state = OpenLayers.State.UPDATE;
                    }
                }
            },

            sm: sm,
            cm: new Ext.grid.ColumnModel({
                defaults: {
                    sortable: true,
                    editor: {
                        xtype: "textfield"
                    }
                },
                columns: columnsForGrid
            })/*,
             bbar: [new Ext.PagingToolbar({
             pageSize: 2,
             store: store,
             displayInfo: true,
             displayMsg: 'Features {0} - {1} of {2}',
             emptyMsg: "No features"
             })]*/
        });

        var activeTab = Ext.getCmp("mainTabs").getActiveTab();
        Ext.getCmp("mainTabs").activate(3);
        south.add(grid);
        gridPanel = Ext.getCmp("gridpanel");
        south.doLayout();
        Ext.getCmp("mainTabs").activate(activeTab);
        Ext.getCmp('editcreatebutton').toggle(false);
        Ext.getCmp('editcreatebutton').setDisabled(false);
        Ext.getCmp('editdeletebutton').setDisabled(false);
        Ext.getCmp('editsavebutton').setDisabled(false);
        Ext.getCmp('editstopbutton').setDisabled(false);
    };

    if (offline) {
        createColumns();
        createLayer();
        if (quickDrawMode) {
            Ext.getCmp('editcreatebutton').toggle(true);
        }
    } else {
        $.ajax({
            url: '/controllers/table/columns/' + layerName,
            type: 'GET',
            success: function (response) {
                localStorage.setItem(key, JSON.stringify(response));
                createColumns();
                createLayer();
                if (quickDrawMode) {
                    Ext.getCmp('editcreatebutton').toggle(true);
                }
            }
        });
    }
    // Add touch event to buttons, which wasn't rendered on app load.
    addTouch();
}

function stopEdit() {
    "use strict";
    layerBeingEditing = null;
    try {
        filter.win.hide();
        filter.win = false;
    }
    catch (e) {
    }
    Ext.getCmp('editcreatebutton').toggle(false);
    Ext.getCmp('editcreatebutton').setDisabled(true);
    Ext.getCmp('editdeletebutton').setDisabled(true);
    Ext.getCmp('editsavebutton').setDisabled(true);
    Ext.getCmp('editstopbutton').setDisabled(true);
    //Ext.getCmp('infobutton').setDisabled(true);
    attributeForm.form.disable();
    try {
        drawControl.deactivate();
        layer.removeAllFeatures();
        map.removeLayer(layer);
    } catch (e) {
        //console.log(e.message);
    }
    // Ext.getCmp("attrtable").collapse(true);
}

function array_unique(ar) {
    "use strict";
    var sorter = {}, out = [];
    if (ar.length && typeof ar !== 'string') {
        for (var i = 0, j = ar.length; i < j; i++) {
            if (!sorter[ar[i] + typeof ar[i]]) {
                out.push(ar[i]);
                sorter[ar[i] + typeof ar[i]] = true;
            }
        }
    }
    return out || ar;
}

saveStrategy = new OpenLayers.Strategy.Save({
    onCommit: function (response) {
        var format, doc, error;
        if (!response.success()) {
            format = new OpenLayers.Format.XML();
            doc = format.read(response.priv.responseText);
            try {
                error = doc
                    .getElementsByTagName('ServiceException')[0].firstChild.data;
            } catch (e) {
            }
            try {
                error = doc
                    .getElementsByTagName('wfs:ServiceException')[0].firstChild.data;
            } catch (e) {
            }
            message = "<p>Sorry, but something went wrong. The whole transaction is rolled back. Try to correct the problem and hit save again. You can look at the error below, maybe it will give you a hint about what's wrong</p><br/><textarea rows='5' cols='31'>" + error + "</textarea>";
            alert(message);
        } else {
            saveStrategy.layer.refresh();
            format = new OpenLayers.Format.XML();
            doc = format.read(response.priv.responseText);
            try {
                var inserted = doc
                    .getElementsByTagName('wfs:totalInserted')[0].firstChild.data;
            } catch (e) {
            }

            try {
                var deleted = doc
                    .getElementsByTagName('wfs:totalDeleted')[0].firstChild.data;
            } catch (e) {
            }

            try {
                var updated = doc
                    .getElementsByTagName('wfs:totalUpdated')[0].firstChild.data;
            } catch (e) {
            }

            try {
                var updated = doc
                    .getElementsByTagName('wfs:Message')[0].firstChild.data;
            } catch (e) {
            }


            // For webkit
            try {
                var inserted = doc
                    .getElementsByTagName('totalInserted')[0].firstChild.data;
            } catch (e) {
            }

            try {
                var deleted = doc
                    .getElementsByTagName('totalDeleted')[0].firstChild.data;
            } catch (e) {
            }

            try {
                var updated = doc
                    .getElementsByTagName('totalUpdated')[0].firstChild.data;
            } catch (e) {
            }

            try {
                var updated = doc
                    .getElementsByTagName('Message')[0].firstChild.data;
            } catch (e) {
            }


            var message = "";
            if (inserted) {
                message = "<p>Inserted: " + inserted + "</p>";
                window.parent.App.setAlert(App.STATUS_OK, message);
            }
            if (updated) {
                message = "<p>Updated: " + updated + "</p>";
                window.parent.App.setAlert(App.STATUS_OK, message);
            }
            if (deleted) {
                message = "<p>Deleted: " + deleted + "</p>";
                window.parent.App.setAlert(App.STATUS_OK, message);
            }
            //window.parent.writeFiles(false, map);
            var l;
            l = window.map.getLayersByName(schema + "." + layerBeingEditing)[0];
            l.clearGrid();
            var n = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            l.url = l.url.replace(l.url.split("?")[1], "");
            l.url = l.url + "token=" + n;
            setTimeout(function () {
                l.redraw();
            }, 500);
        }
    }
});

// Function for adding thouch events to buttons for responsive feedback. Extjs3 isn't touch enabled.
var addTouch = function () {
    $(".x-btn-small").on('touchstart', function (e) {
        $(this).css("background-color", "#2E75B3");
    }).on('touchend', function (e) {
        $(this).css("background-color", "#848482");
    });

    $(".x-combo-list-item").on('touchmove', function (e) {
        $(this).css("background-color", "#bbbbbb");
    }).on('touchend', function (e) {
        $(this).css("background-color", "#ffffff");
    });

    $(".x-panel-bbar .x-btn-small,.x-panel-tbar .x-btn-small").on('touchstart', function (e) {
        $(this).css("background-color", "#bbbbbb");
    }).on('touchend', function (e) {
        $(this).css("background-color", "inherit");
    });
};


