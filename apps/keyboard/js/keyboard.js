function addLine(container, line) {
        let row = document.createElement("div");

        for (let char of line) {
          let box = document.createElement("span");
          box.textContent = char;
          row.appendChild(box);
        }

        container.appendChild(row);
}

document.addEventListener(
        "DOMContentLoaded",
        () => {
          let vkb = document.getElementById("vkb");
          addLine(vkb, "1234567890");
          addLine(vkb, "qwertyuiop");
          addLine(vkb, "asdfghjkl;");
          addLine(vkb, "zxcvbnm,./");

          vkb.addEventListener("click", event => {
            let key = event.target.textContent;
            console.log(`Event 'click' on ${key}`);
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
          });

        },
        { once: true }
);