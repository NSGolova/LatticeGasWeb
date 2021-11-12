function loadImage(completion) {
  var input = document.createElement('input');
  input.type = 'file';

  input.onchange = e => {

     // getting a hold of the file reference
     var file = e.target.files[0];

     // setting up the reader
     var reader = new FileReader();
     reader.readAsDataURL(file);

     // here we tell the reader what to do when it's done reading...
     reader.onload = readerEvent => {
        var content = readerEvent.target.result;
        const img = new Image();
        img.onload = function() {
          completion(img);
        }
        img.src = content;
     }

  }

  input.click();
}

function loadFile(completion) {
  var input = document.createElement('input');
  input.type = 'file';

  input.onchange = e => {

     // getting a hold of the file reference
     var file = e.target.files[0];

     // setting up the reader
     var reader = new FileReader();
     reader.readAsText(file);

     // here we tell the reader what to do when it's done reading...
     reader.onload = readerEvent => {
        var content = readerEvent.target.result;
        completion(JSON.parse(content));
     }

  }

  input.click();
}

function saveJSONAsFile(json, fileName) {
    var link = document.createElement("a");

    document.body.appendChild(link); // for Firefox

    link.setAttribute("href", URL.createObjectURL(new Blob([json], {
      type: "text/plain"
    })));
    link.setAttribute("download", fileName);
    link.click();
}
