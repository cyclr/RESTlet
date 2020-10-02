// If set to true, error email notifications with error details are suppressed after script execution.
const SUPPRESS_NOTIFICATION = false;

// Number of records to get for each page.
// Warning: this must be the same as the page size set in the NetSuite connector.
const PAGE_SIZE = 100;

// Field name for subscriptions.
const subscriptionsFieldName = 'subscriptions';

// GET function.
function getRecord(datain) {
    if (datain.id != null) {
        var record = nlapiLoadRecord(datain.recordtype, datain.id);
        var transformed = transformRecord(record);
        return transformed;
    }

    var page = 1;
    if (datain.page != null)
        page = datain.page;

    var searchResult = null;
    var resultStart = (page - 1) * PAGE_SIZE;
    var resultLength = 0;
    if (datain.searchid) {
        // Run saved search.
        var savedSearch = nlapiLoadSearch(datain.recordtype, datain.searchid);
        var resultset = savedSearch.runSearch();
        searchResult = resultset.getResults(resultStart, page * PAGE_SIZE);
        if (searchResult != null) {
            resultStart = 0; // searchResult only contains page of items, reset start to 0 for iteration below.
            resultLength = searchResult.length;
        }
    } else {
        // Run record search
        var filters = null;
        var columns = null;
        if (datain.filter_field_1 != null) {
            filters = buildFilters(datain);
            columns = buildColumns(datain);
        }
        searchResult = nlapiSearchRecord(datain.recordtype, null, filters, columns);
        if (searchResult != null)
            resultLength = Math.min((page * PAGE_SIZE), searchResult.length);
    }

    var result = [];
    for (var i = resultStart; i < resultLength; i++)
    {
        var record = nlapiLoadRecord(searchResult[i].getRecordType(), searchResult[i].getId());
        transformed = transformRecord(record);
        result.push(transformed);
    }
    return result;
}

// POST function.
function createRecord(datain) {
    if (datain.cmd == 'attach') {
        nlapiAttachRecord(datain.sourceType, datain.sourceId, datain.destinationType, datain.destinationId, datain.options); 
    } else {
        var record = nlapiCreateRecord(datain.recordtype);
        return setRecord(record, datain);
    }
}

// DELETE function.
function deleteRecord(datain) {
    if (datain.cmd == 'detach') {
        nlapiDetachRecord(datain.sourceType, datain.sourceId, datain.destinationType, datain.destinationId, datain.options);
    } else {
        nlapiDeleteRecord(datain.recordtype, datain.id);
    }
}

// PUT function.
function updateRecord(datain) {
    var record = nlapiLoadRecord(datain.recordtype, datain.id);
    return setRecord(record, datain);
}

// Builds search columns.
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

// Builds search filters.
function buildFilters(datain) {
    var filters = [];

    // Temporary record used for getting field types.
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

// Gets field value in correct field format from the record.
function getRecordFieldValue(record, fieldName, fieldValue) {
    if (!record || !fieldName)
        return fieldValue;

    var field = record.getField(fieldName);
    return getFieldValue(field, fieldValue);
}

// Gets field value in correct field format.
function getFieldValue(field, fieldValue) {
    if (!field)
        return fieldValue;

    // Convert ISO date to account date.
    if (field.type === 'date')
        return nlapiDateToString(new Date(fieldValue + 'T08:00:00.000Z'), 'date');

    // Convert ISO date time to JS Date.
    if (field.type === 'datetime' || field.type === 'datetimetz')
        return new Date(fieldValue);

    // Convert checkbox boolean to T/F
    if (field.type === 'checkbox')
        return fieldValue ? 'T' : 'F';

    return fieldValue;
}

// Normalizes the record.
function transformRecord(record) {
    // Convert the record to an object so we can manipulate its values.
    var transformed = JSON.parse(JSON.stringify(record));

    // Transform fields.
    var fields = record.getAllFields();
    for (i = 0; i < fields.length; i++) {
        var field = record.getField(fields[i]);
        if (!field)
            continue;

        if (field.type === 'integer') {
            // SuiteScript 1.0 serialise integers larger than 32 bits to 0.
            // Fix: manually set the value.
            var integerValue = record.getFieldValue(fields[i]);
            if (integerValue == null)
                continue;
            transformed[fields[i]] = integerValue;
        }
        else if (field.type === 'date') {
            // Convert account date to ISO date.
            var date = record.getDateTimeValue(fields[i]);
            if (!date)
                continue;
            var iso = nlapiStringToDate(date).toISOString().substring(0, 10);
            transformed[fields[i]] = iso;
        }
        else if (field.type === 'datetime' || field.type === 'datetimetz') {
            // Convert account date time to ISO date time.
            var pacific = record.getDateTimeValue(fields[i], 'America/Los_Angeles');
            if (!pacific)
                continue;
            var iso = nlapiStringToDate(pacific, 'datetimetz').toISOString();
            transformed[fields[i]] = iso;
        }
    }

    // Transform sublists.
    var lineItems = record.getAllLineItems();
    for (var i = 0; i < lineItems.length; i++) {
        var transformedLineItem = transformed[lineItems[i]];
        if (!Array.isArray(transformedLineItem) || transformedLineItem.length < 1)
            continue;

        var lineItemFields = record.getAllLineItemFields(lineItems[i]);
        for (var j = 0; j < lineItemFields.length; j++) {
            var field = record.getLineItemField(lineItems[i], lineItemFields[j], 1);
            if (!field)
                continue;

            if (field.type === 'integer') {
                for (var k = 1; k <= transformedLineItem.length; k++) {
                    // SuiteScript 1.0 serialise integers larger than 32 bits to 0.
                    // Fix: manually set the value.
                    var integerValue = record.getLineItemValue(lineItems[i], lineItemFields[j], k);
                    if (integerValue == null)
                        continue;
                    transformedLineItem[k - 1][lineItemFields[j]] = integerValue;
                }
            }
            else if (field.type === 'date') {
                for (var k = 1; k <= transformedLineItem.length; k++) {
                    // Convert account date to ISO date.
                    var date = record.getLineItemDateTimeValue(lineItems[i], lineItemFields[j], k);
                    if (!date)
                        continue;
                    var iso = nlapiStringToDate(date).toISOString().substring(0, 10);
                    transformedLineItem[k - 1][lineItemFields[j]] = iso;

                }
            }
            else if (field.type === 'datetime' || field.type === 'datetimetz') {
                for (var k = 1; k <= transformedLineItem.length; k++) {
                    // Convert account date time to ISO date time.
                    var pacific = record.getLineItemDateTimeValue(lineItems[i], lineItemFields[j], k,
                        'America/Los_Angeles');
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

// Sets record fields from data in.
function setRecord(record, datain) {
    var lineItems = record.getAllLineItems();

    for (var fieldName in datain) {
        if (!datain.hasOwnProperty(fieldName) ||
            fieldName === 'recordtype' || fieldName === 'id')
            continue;

        var fieldValue = datain[fieldName];
        var field = record.getField(fieldName);

        if (!field && lineItems.indexOf(fieldName) > -1) {
            // Update the subscriptions.
            if (fieldName === subscriptionsFieldName) {
                setSubscriptions(record, datain);
                continue; // Move on to next field.
            }

            // Remove all sublists first.
            var count = record.getLineItemCount(fieldName);
            for (var i = count; i >= 1; i--) {
                record.removeLineItem(fieldName, i);
            }

            // Add new sublists.
            createSublists(record, fieldName, fieldValue);
            continue;
        }

        setRecordFieldValue(record, fieldName, fieldValue);
    }

    var recordId = nlapiSubmitRecord(record);
    return nlapiLoadRecord(datain.recordtype, recordId);
}

// Creates sublists in the record.
function createSublists(record, sublistName, sublistFields) {
    if (!Array.isArray(sublistFields))
        sublistFields = [sublistFields];

    for (var i = 0; i < sublistFields.length; i++)
        createSublist(record, sublistName, sublistFields[i]);
}

// Creates a sublist in the record.
function createSublist(record, sublistName, sublistFields) {
    record.selectNewLineItem(sublistName);

    for (var sublistField in sublistFields) {
        var sublistValue = sublistFields[sublistField];
        var field = record.getLineItemField(sublistName, sublistField, 1);
        if (!field) {
            // Checks if the field is a subrecord and processes it if true.
            try {
                var subrecord = record.createCurrentLineItemSubrecord(sublistName, sublistField);
            } catch (e) {
                throw nlapiCreateError('CYCLR_INVALID_SUBLIST_FIELD',
                    'Sublist name: ' + sublistName + '\tField name: ' + sublistField,
                    SUPPRESS_NOTIFICATION);
            }
            setSubrecordValues(subrecord, sublistValue);
            continue;
        }

        if (field.type === 'select') {
            if (sublistValue.internalid != null)
                record.setCurrentLineItemValue(sublistName, sublistField, sublistValue.internalid);
            else if (sublistValue.name != null)
                record.setCurrentLineItemText(sublistName, sublistField, sublistValue.name);
            continue;
        }

        if (field.type === 'multiselect') {
            if (!Array.isArray(sublistValue))
                sublistValue = [sublistValue];

            if (sublistValue.length < 1)
                continue;

            if (sublistValue[0].internalid != null) {
                sublistValue = sublistValue.map(function (v) {
                    return v.internalid;
                });
                record.setCurrentLineItemValues(sublistName, sublistField, sublistValue);
            }
            else if (sublistValue[0].name != null) {
                // SuiteScript doesn't have setCurrentLineItemTexts.
                // Need to convert names to internal IDs.
                sublistValue = sublistValue.map(function (v) {
                    var options = field.getSelectOptions(v.name, 'is');
                    return options.length < 1 ? null : options[0];
                }).filter(function (v) {
                    return v != null;
                });
                record.setCurrentLineItemValues(sublistName, sublistField, sublistValue);
            }
            continue;
        }

        sublistValue = getFieldValue(field, sublistValue);
        record.setCurrentLineItemValue(sublistName, sublistField, sublistValue);
    }

    record.commitLineItem(sublistName);
}

// Sets field value in the record.
function setRecordFieldValue(record, fieldName, fieldValue) {
    var field = record.getField(fieldName);
    if (!field) {
        throw nlapiCreateError('CYCLR_INVALID_FIELD',
            'Field name: ' + fieldName,
            SUPPRESS_NOTIFICATION);
    }

    if (field.type === 'select') {
        if (fieldValue.internalid != null)
            record.setFieldValue(fieldName, fieldValue.internalid);
        else if (fieldValue.name != null)
            record.setFieldText(fieldName, fieldValue.name);
        return;
    }

    if (field.type === 'multiselect') {
        if (!Array.isArray(fieldValue))
            fieldValue = [fieldValue];

        if (fieldValue.length < 1)
            return;

        if (fieldValue[0].internalid != null) {
            fieldValue = fieldValue.map(function (v) {
                return v.internalid;
            });
            record.setFieldValues(fieldName, fieldValue);
        }
        else if (fieldValue[0].name != null) {
            fieldValue = fieldValue.map(function (v) {
                return v.name;
            });
            record.setFieldTexts(fieldName, fieldValue);
        }
        return;
    }

    var transformed = getRecordFieldValue(record, fieldName, fieldValue);
    record.setFieldValue(fieldName, transformed);
}

// Sets field values in a subrecord.
function setSubrecordValues(subrecord, sublistValue) {
    if (typeof sublistValue === 'object') {
        for (var fieldName in sublistValue) {
            setRecordFieldValue(subrecord, fieldName, sublistValue[fieldName])
        }
    } else {
        setRecordFieldValue(subrecord, fieldName, sublistValue);
    }
    subrecord.commit();
}

// Sets subscriptions in the record.
function setSubscriptions(record, datain) {
    var count = record.getLineItemCount(subscriptionsFieldName);
    if (count == 0)
        return; // No subscriptions to set.

    // Get the subscription internal ids and names.
    var subscriptionIdNameMap = JSON.parse(JSON.stringify(record))[subscriptionsFieldName]
        .reduce(function (accumulator, currentValue) {
            currentValue = currentValue.subscription;
            accumulator[currentValue.internalid] = currentValue.name;
            return accumulator;
        }, {});

    for (var i = 1; i <= count; i++) {
        var subscriptionId = record.getLineItemValue(subscriptionsFieldName, 'subscription', i);
        if (!subscriptionIdNameMap.hasOwnProperty(subscriptionId))
            continue;

        // Find the subscription name.
        var subscriptionName = subscriptionIdNameMap[subscriptionId];

        // Find the datain that matches the subscription.
        var datainSubscription = null;
        for (var c = 0; c < datain.subscriptions.length; c++) {
            // Find the subscription by ID or name. If ID provided name will be ignored.
            if (datain.subscriptions[c].subscription.internalid != null &&
                datain.subscriptions[c].subscription.internalid == subscriptionId) {
                datainSubscription = datain.subscriptions[c];
                break;
            }
            else if (datain.subscriptions[c].subscription.name != null &&
                datain.subscriptions[c].subscription.name === subscriptionName) {
                datainSubscription = datain.subscriptions[c];
                break;
            }
        }

        var valueToSet = null;
        if (datainSubscription == null)
            valueToSet = 'F'; // Subscription not provided in update.
        else
            valueToSet = datainSubscription.subscribed ? 'T' : 'F';
        record.setLineItemValue(subscriptionsFieldName, 'subscribed', i, valueToSet);
    }
}
