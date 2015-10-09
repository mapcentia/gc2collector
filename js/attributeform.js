Ext.namespace('attributeForm');
Ext.namespace("filter");
attributeForm.init = function (layer, geomtype) {
    Ext.QuickTips.init();
    // create attributes store

    try {
        Ext.getCmp("attpanel").remove(attributeForm.form);
    } catch (e) {
    }

    try {
        attributeForm.form.destroy();
    } catch (e) {
    }
    try {
        attributeForm.form = undefined;
    } catch (e) {
    }


    try {
        attributeForm.attributeStore.destroy();
    } catch (e) {
    }
    try {
        attributeForm.attributeStore = undefined;
    } catch (e) {
    }

    attributeForm.attributeStore = new GeoExt.data.AttributeStore({
        url: host + '/wfs/' + screenName + '/' + schema + '?REQUEST=DescribeFeatureType&TYPENAME=' + layer,
        listeners: {
            load: {
                scope: this,
                fn: function (_store) {
                    attributeForm.attributeStoreCopy = new Ext.data.ArrayStore();
                    _store.each(function (record) {
                        var match = /gml:((Multi)?(Point|Line|Polygon|Curve|Surface)).*/.exec(record.get("type"));
                        if (!match) {
                            var newDataRow = {"name": record.get("name"), "value": null};
                            var newRecord = new attributeForm.attributeStore.recordType(newDataRow);
                            attributeForm.attributeStoreCopy.add(newRecord);
                        }
                    }, this);
                    filter.filterBuilder = new gxp.FilterBuilder({
                        attributes: attributeForm.attributeStoreCopy,
                        allowGroups: false
                    });
                    filter.queryPanel = new Ext.Panel({
                        id: "uploadpanel",
                        frame: false,
                        region: "center",
                        bodyStyle: {
                            background: '#ffffff',
                            padding: '7px'
                        },
                        query: function () {
                            var filters = filter.filterBuilder.getFilter(), valid = true;
                            if (typeof filters.filters === "object") {
                                $.each(filters.filters, function (k, v) {
                                    if (v === false) {
                                        valid = false;
                                    }
                                });
                            }

                            if (valid) {
                                if ((layerBeingEditing)) {
                                    var protocol = store.proxy.protocol;
                                    protocol.defaultFilter = filter.filterBuilder.getFilter();
                                    saveStrategy.layer.refresh();
                                } else {
                                    startWfsEdition(layer, geomtype, filters, false);
                                }
                            }
                        },
                        items: [filter.filterBuilder,
                            {
                                xtype: "button",
                                text: "<i class='icon-ok btn-gc'></i> " + __("Load"),
                                handler: function () {
                                    Ext.getCmp("mainTabs").activate(1);
                                    filter.queryPanel.query();
                                    filter.win.close();
                                }
                            }]
                    });
                    filter.win = new Ext.Window({
                        title: __("Load features"),
                        modal: true,
                        layout: 'fit',
                        initCenter: true,
                        border: false,
                        width: 200,
                        height: 200,
                        closeAction: 'hide',
                        plain: true,
                        items: [new Ext.Panel({
                            frame: false,
                            layout: 'border',
                            items: [filter.queryPanel]
                        })],
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
                    });
                }
            }
        }
    });
    attributeForm.form = new Ext.form.FormPanel({
        autoScroll: true,
        region: 'center',
        viewConfig: {
            forceFit: true
        },
        border: false,
        labelWidth: 150,
        bodyStyle: {
            background: '#ffffff',
            padding: '7px'
        },
        defaults: {
            //width: 150,
            maxLengthText: "too long",
            minLengthText: "too short",
            anchor: '100%'
        },
        plugins: [
            new GeoExt.plugins.AttributeForm({
                attributeStore: attributeForm.attributeStore
            })
        ],
        buttons: [
            {
                text: "<i class='icon-ok btn-gc'></i> " + __("Update table"),
                handler: function () {
                    if (attributeForm.form.form.isValid()) {
                        var record = grid.getSelectionModel().getSelected();
                        attributeForm.form.getForm().updateRecord(record);
                        var feature = record.get("feature");
                        if (feature.state !== OpenLayers.State.INSERT) {
                            feature.state = OpenLayers.State.UPDATE;
                        }
                    } else {
                        var s = '';
                        Ext.iterate(detailForm.form.form.getValues(), function (key, value) {
                            s += String.format("{0} = {1}<br />", key, value);
                        }, this);
                    }
                }
            }
        ]
    });
    attributeForm.attributeStore.load();
};
function getFieldType(attrType) {
    "use strict";
    return ({
        "xsd:boolean": "boolean",
        "xsd:int": "int",
        "xsd:integer": "int",
        "xsd:short": "int",
        "xsd:long": "int",
        "xsd:date": "date",
        "xsd:string": "string",
        "xsd:float": "float",
        "xsd:double": "float",
        "xsd:decimal": "float",
        "gml:PointPropertyType": "int"
    })[attrType];
}

