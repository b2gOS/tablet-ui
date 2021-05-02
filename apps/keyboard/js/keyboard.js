function addLine(container, line) {
        let row = document.createElement("div");

        for (let char of line) {
          let box = document.createElement("span");
          box.textContent = char;
          row.appendChild(box);
        }

        container.appendChild(row);
}

function addFunctionLine(container){
  var FunctionLine = '<div id="cvc">' +
              '<span style="width: 3em;">Enter</span>' +
              '<span style="width: 7em;">Space</span>' +
              '<span style="width: 3em;">Del</span>' +
              '</div>';
        container.insertAdjacentHTML('beforeend', FunctionLine);
}

document.addEventListener(
        "DOMContentLoaded",
        () => {
          let vkb = document.getElementById("vkb");
          addLine(vkb, "1234567890");
          addLine(vkb, "qwertyuiop");
          addLine(vkb, "asdfghjkl;");
          addLine(vkb, "zxcvbnm,./");
          addFunctionLine(vkb);

          vkb.addEventListener("click", event => {
            let key = event.target.textContent;
            console.log(`Event 'click' on ${key}`);
            switch (key) {
              case 'Enter':
                navigator.b2g.inputMethod.sendKey("Enter");
                break;
              case 'Space':
                navigator.b2g.inputMethod.sendKey(" ");
                break;
              case 'Del':
                navigator.b2g.inputMethod.deleteBackward();
                break;
              default:
                let ime = navigator.b2g.inputMethod;
                ime
                  .setComposition(key)
                  .then(ime.endComposition(key))
                  .then(
                    () => {
                      console.log(`IME adding ${key} ok`);
                    },
                    () => {
                      console.log(`IME error adding ${key}`);
                    }
                  );    
                break;
            }
          });

        },
        { once: true }
);