function getRecord(datain) {
    if (datain.id) {
        var record = nlapiLoadRecord(datain.recordtype, datain.id);
        record = transformRecord(record);
        return record;
    }

    var page = 1;
    var pageSize = 10;
    if (datain.page)
        page = datain.page;

    var filters = null;
    var columns = null;
    if (datain.filter_field_1) {
        filters = buildFilters(datain);
        columns = buildColumns(datain);
    }

    var ids = nlapiSearchRecord(datain.recordtype, null, filters, columns);
    if (!ids)
        return [];

    var result = [];
    for (var i = ((page - 1) * pageSize); i < Math.min((page * pageSize), ids.length); i++) {
        var record = nlapiLoadRecord(ids[i].getRecordType(), ids[i].getId());
        record = transformRecord(record);
        result.push(record);
    }
    return result;
}

function buildFilters(datain) {
    var filters = [];

    // Temporary record for getting field types
    var record = nlapiCreateRecord(datain.recordtype);

    for (var i = 1; ; i++) {
        var field = "filter_field_" + i;
        var op = "filter_op_" + i;
        var val = "filter_val_" + i;
        if (!datain[field])
            break;

        var filterValue = getRecordFieldValue(record, datain[field], datain[val]);
        var filter = new nlobjSearchFilter(datain[field], null, datain[op], filterValue);
        filters.push(filter);
    }

    return filters;
}

function buildColumns(datain) {
    var columns = [];

    for (var i = 1; ; i++) {
        var field = "filter_field_" + i;
        if (!datain[field])
            break;

        var column = new nlobjSearchColumn(datain[field]);
        columns.push(column);
    }

    return columns;
}

function getRecordFieldValue(record, fieldName, fieldValue) {
    if (!fieldName || !fieldValue)
        return fieldValue;

    var field = record.getField(fieldName);
    return getFieldValue(field, fieldValue);
}

function getFieldValue(field, fieldValue) {
    if (!field || !fieldValue)
        return fieldValue;

    // Convert ISO date to account date
    if (field.type === 'date')
        return nlapiDateToString(new Date(fieldValue + 'T08:00:00.000Z'), 'date');

    // Convert ISO date time to JS Date
    if (field.type === 'datetime' || field.type === 'datetimetz')
        return new Date(fieldValue);

    return fieldValue;
}

function transformRecord(data) {
    // Convert the record to an object so we can manipulate its values
    var transformed = JSON.parse(JSON.stringify(data));

    var fields = data.getAllFields();
    for (i = 0; i < fields.length; i++) {
        var field = data.getField(fields[i]);
        if (!field)
            continue;

        if (field.type === 'date') {
            // Convert account date to ISO date
            var date = data.getDateTimeValue(fields[i]);
            if (!data)
                continue;
            var iso = nlapiStringToDate(date).toISOString().substring(0, 10);
            transformed[fields[i]] = iso;
        }
        else if (field.type === 'datetime' || field.type === 'datetimetz') {
            // Convert account date time to ISO date time
            var pacific = data.getDateTimeValue(fields[i], 'America/Los_Angeles');
            if (!pacific)
                continue;
            var iso = nlapiStringToDate(pacific, 'datetimetz').toISOString();
            transformed[fields[i]] = iso;
        }
    }

    var lineItems = data.getAllLineItems();
    for (var i = 0; i < lineItems.length; i++) {
        var transformedLineItem = transformed[lineItems[i]];
        if (!Array.isArray(transformedLineItem) || transformedLineItem.length < 1)
            continue;

        var lineItemFields = data.getAllLineItemFields(lineItems[i]);
        if (!lineItemFields)
            continue;

        for (var j = 0; j < lineItemFields.length; j++) {
            var field = data.getLineItemField(lineItems[i], lineItemFields[j], 1);
            if (!field)
                continue;

            if (field.type === 'date') {
                for (var k = 1; k <= transformedLineItem.length; k++) {
                    // Convert account date to ISO date
                    var date = data.getLineItemDateTimeValue(lineItems[i], lineItemFields[j], k);
                    if (!date)
                        continue;
                    var iso = nlapiStringToDate(date).toISOString().substring(0, 10);
                    transformedLineItem[k - 1][lineItemFields[j]] = iso;

                }
            }
            else if (field.type === 'datetime' || field.type === 'datetimetz') {
                for (var k = 1; k <= transformedLineItem.length; k++) {
                    // Convert account date time to ISO date time
                    var pacific = data.getLineItemDateTimeValue(lineItems[i], lineItemFields[j], k, 'America/Los_Angeles');
                    if (!pacific)
                        continue;
                    var iso = nlapiStringToDate(pacific, 'datetimetz').toISOString();
                    transformedLineItem[k - 1][lineItemFields[j]] = iso;
                }
            }
        }
    }

    return transformed;
}

function createRecord(datain) {
    if (!datain.recordtype) {
        return {
            status: "failed",
            message: "missing recordtype"
        };
    }

    var record = nlapiCreateRecord(datain.recordtype);
    for (var fieldname in datain) {
        if (!datain.hasOwnProperty(fieldname) ||
            fieldname === 'recordtype' || fieldname === 'id')
            continue;

        var fieldValue = datain[fieldname];
        if (!fieldValue)
            continue;

        /**
        * Populate fields
        * sublists come in as objects that contain the line column values
        **/
        if (Array.isArray(fieldValue)) {
            for (var i = 0; i < fieldValue.length; i++)
                createLineItem(record, fieldname, fieldValue[i])
        }
        else if (typeof fieldValue == 'object')
            createLineItem(record, fieldname, fieldValue)
        else {
            fieldValue = getRecordFieldValue(record, fieldname, fieldValue);
            record.setFieldValue(fieldname, fieldValue);
        }
    }

    var recordId = nlapiSubmitRecord(record);
    return nlapiLoadRecord(datain.recordtype, recordId);
}

function createLineItem(record, fieldname, fieldValue) {
    record.selectNewLineItem(fieldname);
    for (var sublistField in fieldValue) {
        var sublistValue = fieldValue[sublistField];
        var field = record.getLineItemField(fieldname, sublistField, 1);
        sublistValue = getFieldValue(field, sublistValue);
        record.setCurrentLineItemValue(fieldname, sublistField, sublistValue);
    }
    record.commitLineItem(fieldname);
}

function deleteRecord(datain) {
    nlapiDeleteRecord(datain.recordtype, datain.id);
}

function updateRecord(datain) {
    var record = nlapiLoadRecord(datain.recordtype, datain.id);
    for (var fieldname in datain) {
        if (!datain.hasOwnProperty(fieldname) ||
            fieldname === 'recordtype' || fieldname === 'id')
            continue;

        var fieldValue = datain[fieldname];
        if (!fieldValue || typeof fieldValue === 'object')
            continue;

        fieldValue = getRecordFieldValue(record, fieldname, fieldValue);
        record.setFieldValue(fieldname, fieldValue);
    }

    nlapiSubmitRecord(record);
    return nlapiLoadRecord(datain.recordtype, datain.id);
}
