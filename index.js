const path = require("path");
const fs = require("fs");

const csv = require("csvtojson");
const moment = require("moment");

csv().fromFile(path.resolve(__dirname, "results.csv"))
    .then((jsonObj)=>{
        const list = jsonObj.map((obj) => {
            return {
                number: obj["REGISTRATIONNUMBER"],
                registrant: obj["REGISTRANTNAME"],
                date: moment(obj["STAMPED/RECEIVEDDATE"], "DD-MMM-YYYY").valueOf(),
                link: [{
                    url: obj["DOCUMENT_URL"],
                    text: obj["DOCUMENTTYPE"],
                    dateFiled: moment(obj["STAMPED/RECEIVEDDATE"], "DD-MMM-YYYY").valueOf()
                }]
            };
        }).reduce((accumulator, currentValue) => {
            const matching = accumulator.findIndex((obj) => obj.number === currentValue.number && obj.registrant === currentValue.registrant); // Will return -1 if no match...
            if(matching === -1){
                accumulator.push(currentValue);
                if(accumulator.date < currentValue.date){
                    accumulator.date = currentValue.date; // Set date (aka most recent filing)
                };
                return accumulator;
            } else {
                let oldLinks = accumulator[matching].link;
                let newLink = currentValue.link;
                accumulator[matching].link = [...oldLinks, ...newLink ];
                return accumulator;
            }
        }, []).map((obj) => {
            obj['allLinks'] = obj['link'].filter((link) => link.url !== "http://www.fara.gov/contact.html");
            delete obj['link'];
            return obj;
        });

        const data = JSON.stringify(list);

        fs.writeFile('fara.json', data, (err) => {  
            if (err) throw err;
            console.log('Data written to file');
        });
        
    });



    // reduce((accumulator, currentValue) => { // Combine identical items" links into single allLink
    //         const matching = accumulator.findIndex((obj) => obj.number === currentValue.number && obj.registrant === currentValue.registrant); // Will return -1 if no match...
    //         if(matching === -1){
    //             accumulator.push(currentValue);
    //             return accumulator;
    //         } else {
    //             let oldLinks = accumulator[matching].allLinks;
    //             let newLink = currentValue.allLinks;
    //             accumulator[matching].allLinks = [ ...oldLinks, ...newLink ];
    //             return accumulator;
    //         };
    //     }, []);