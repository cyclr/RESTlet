function getRecord(datain) {
  if (datain.id != void(0))
    return nlapiLoadRecord(datain.recordtype, datain.id);

  var page = 1;
  var pageSize = 10;
  var filters = null;
  var columns = null;
  if(datain.filter_field_1 != void(0)) {
    filters = buildFilters(datain);
    columns = buildColumns(datain);
  }

  var ids = nlapiSearchRecord(datain.recordtype, null, filters, columns);
  var result = [];

  if(datain.page != void(0))
    page = datain.page;
  
  if(ids != void(0)) {
    for(var i = ((page - 1) * pageSize); i < Math.min((page * pageSize), ids.length); i++) {
      result.push(nlapiLoadRecord(ids[i].getRecordType(), ids[i].getId()));
    }
  }
  
  return result;
}

function buildColumns(datain) {
    var x = 1;
    var columns = [];

    var field = "filter_field_" + x;

    while(datain[field] !== void(0)) {
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

    while(datain[field] !== void(0)) {
        filters.push(new nlobjSearchFilter(datain[field], null, datain[op], datain[val]));
        x++;
        field = "filter_field_" + x;
        op = "filter_op_" + x;
        val = "filter_val_" + x;
    }
     
    return filters;
}

function createRecord(datain) {
  if (!datain.recordtype) {
    var err = new Object();
    err.status = "failed";
    err.message= "missing recordtype";
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
  return nlapiLoadRecord(datain.recordtype,recordId);
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
