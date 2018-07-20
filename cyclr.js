function helloWorld(datain) {
  return 'Greetings DemoUser from NetSuite RESTlet Land!';
}

function getRecord(datain) {
  if (datain.id != void(0))
    return nlapiLoadRecord(datain.recordtype, datain.id);

  var page = 1;
  var pageSize = 10;
  var filters = null;
  var columns = null;
  if(datain.field != void(0)) {
    filters = [new nlobjSearchFilter(datain.field, null, datain.op, datain.value)];
    columns = [new nlobjSearchColumn(datain.field)];
  }

  var ids = nlapiSearchRecord(datain.recordtype, null, filters, columns);
  var result = [];

  if(datain.page != void(0))
    page = datain.page;

  for(var i = ((page - 1) * pageSize); i < Math.min((page * pageSize), ids.length); i++) {
    result.push(nlapiLoadRecord(ids[i].getRecordType(), ids[i].getId()));
  }

  return result;
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
        if (value && typeof value != 'object') {
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