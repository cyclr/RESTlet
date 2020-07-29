function getRecord(datain) {
    if (datain.id != void (0)) {
        var record = nlapiLoadRecord(datain.recordtype, datain.id);
        transformRecord(record);
        return record;
    }

    var page = 1;
    var pageSize = 10;
    var filters = null;
    var columns = null;
    if (datain.filter_field_1 != void (0)) {
        filters = buildFilters(datain);
        columns = buildColumns(datain);
    }

    var ids = nlapiSearchRecord(datain.recordtype, null, filters, columns);
    var result = [];

    if (datain.page != void (0))
        page = datain.page;

    if (ids != void (0)) {
        for (var i = ((page - 1) * pageSize); i < Math.min((page * pageSize), ids.length); i++) {
            var record = nlapiLoadRecord(ids[i].getRecordType(), ids[i].getId());
            transformRecord(record);
            result.push(record);
        }
    }

    return result;
}

function buildColumns(datain) {
    var x = 1;
    var columns = [];

    var field = "filter_field_" + x;

    while (datain[field] !== void (0)) {
        columns.push(new nlobjSearchColumn(datain[field]));
        x++;
        field = "filter_field_" + x;
    }
    return columns;
}

function buildFilters(datain) {
    var x = 1;
    var filters = [];

    var field = "filter_field_" + x;
    var op = "filter_op_" + x;
    var val = "filter_val_" + x;

    var record = nlapiCreateRecord(datain.recordtype);
    while (datain[field] !== void (0)) {
        var f = record.getField(datain[field]);
        if (f && (f.type === 'datetime' || f.type === 'datetimetz') && datain[val])
            datain[val] = new Date(datain[val]);

        var filter = new nlobjSearchFilter(datain[field], null, datain[op], datain[val]);
        filters.push(filter);
        x++;
        field = "filter_field_" + x;
        op = "filter_op_" + x;
        val = "filter_val_" + x;
    }

    return filters;
}

function transformRecord(data) {
    var fields = data.getAllFields();

    for (i = 0; i < fields.length; i++) {
        var field = data.getField(fields[i]);
        if (field) {
            if (field.type === 'date') {
                var date = data.getDateTimeValue(fields[i]);
                if (date) {
                    var iso = nlapiStringToDate(date).toISOString().substring(0, 10);
                    data.setFieldValue(fields[i], iso);
                }
            }
            else if (field.type === 'datetime' || field.type === 'datetimetz') {
                var pacific = data.getDateTimeValue(fields[i], 'America/Los_Angeles');
                if (pacific) {
                    var iso = nlapiStringToDate(pacific, 'datetimetz').toISOString();
                    data.setFieldValue(fields[i], iso);
                }
            }
        }
    }

    var lineItems = data.getAllLineItems();
    for (var i = 0; i < lineItems.length; i++) {
        var lineItemFields = data.getAllLineItemFields(lineItems[i]);
        var count = data.getLineItemCount(lineItems[i]);
        if (lineItemFields && count) {
            for (var j = 0; j < lineItemFields.length; j++) {
                for (var k = 1; k <= count; k++) {
                    var field = data.getLineItemField(lineItems[i], lineItemFields[j], k);
                    if (field) {
                        if (field.type === 'date') {
                            var date = data.getLineItemDateTimeValue(lineItems[i], lineItemFields[j], k);
                            if (date) {
                                var iso = nlapiStringToDate(date).toISOString().substring(0, 10);
                                data.setLineItemValue(lineItems[i], lineItemFields[j], k, iso);
                            }
                        }
                        else if (field.type === 'datetime' || field.type === 'datetimetz') {
                            var pacific = data.getLineItemDateTimeValue(lineItems[i], lineItemFields[j], k, 'America/Los_Angeles');
                            if (pacific) {
                                var iso = nlapiStringToDate(pacific, 'datetimetz').toISOString();
                                data.setLineItemValue(lineItems[i], lineItemFields[j], k, iso);
                            }
                        }
                    }
                }
            }
        }
    }
}

function createRecord(datain) {
    if (!datain.recordtype) {
        var err = new Object();
        err.status = "failed";
        err.message = "missing recordtype";
        return err;
    }

    var record = nlapiCreateRecord(datain.recordtype);
    for (var fieldname in datain) {
        if (datain.hasOwnProperty(fieldname)) {
            if (fieldname != 'recordtype' && fieldname != 'id') {
                var value = datain[fieldname];
                if (value && typeof value == 'object') {
                    if (value.length == undefined) {
                        record.selectNewLineItem(fieldname);
                        for (var sublistfield in value) {
                            var sublistvalue = value[sublistfield];
                            record.setCurrentLineItemValue(fieldname, sublistfield, sublistvalue);
                        }
                        record.commitLineItem(fieldname);
                    } else {
                        for (var i = 0; i < value.length; i++) {
                            record.selectNewLineItem(fieldname);
                            for (var sublistfield in value[i]) {
                                var sublistvalue = value[i][sublistfield];
                                record.setCurrentLineItemValue(fieldname, sublistfield, sublistvalue);
                            }
                            record.commitLineItem(fieldname);
                        }
                    }
                } else {
                    /**
                    * Populate fields
                    * sublists come in as objects that contain the line column values
                    **/
                    record.setFieldValue(fieldname, value);
                }
            }
        }
    }

    var recordId = nlapiSubmitRecord(record);
    return nlapiLoadRecord(datain.recordtype, recordId);
}

function deleteRecord(datain) {
    nlapiDeleteRecord(datain.recordtype, datain.id);
}

function updateRecord(datain) {
    var record = nlapiLoadRecord(datain.recordtype, datain.id);
    for (var fieldname in datain) {
        if (datain.hasOwnProperty(fieldname)) {
            if (fieldname != 'recordtype' && fieldname != 'id') {
                var value = datain[fieldname];
                if (value && typeof value != 'object') {
                    record.setFieldValue(fieldname, value);
                }
            }
        }
    }

    nlapiSubmitRecord(record);
    return nlapiLoadRecord(datain.recordtype, datain.id);
}
