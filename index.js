const path = require("path");
const cheerio = require("cheerio");
const pupeteer = require("puppeteer");

const csv = require("csvtojson");
const moment = require("moment");

const convertCSVtoJSON = () => {

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
};

const removeExtraneous = async () => {  
    let trimmed;

    fs.readFile('senators.json', (err, data) => {  
        if (err) throw err;
        let content = JSON.parse(data);
        trimmed = content.map((obj) => {
            delete obj['_id'];
            delete obj["__v"];
            obj.date = parseInt(obj.date.$numberLong);
            return obj;
        });

        fs.writeFile("senatorsTrimmed.json", JSON.stringify(trimmed), (err) => {
            if (err) throw err;
            console.log('Data written to file');
        });
    });
};

const parseResults1 = async(html) => {
    const $ = cheerio.load(html);

    const tds = $(".table-striped tr[role='row'] td").map((i, item) => $(item).text()).toArray()
    const links = $('tbody tr a').map((i, link) => {
        let urlSeg = $(link).attr("href");
        let url = `https://efdsearch.senate.gov${urlSeg}`
        let text = $(link).text();
        return { url, text };
    }).toArray();

    const data = links.map((link, x) => {
        let result = { link, tds: [] };
        for(let i = 0; i < 5; i++){
            result.tds.push(tds[i + (x * 5)]);
        }
        return result;
    });

    return data;
};

const parseResults2 = async(data) => {

    let results = [];
    data.forEach(datum => {
        results.push({
            first: datum.tds[0].trim(),
            last: datum.tds[1].trim(),
            link: datum.link,
            date: moment(datum.tds[4], "MM/DD/YYYY").valueOf()
        })
    });

    return results;
};

const launchScraper = async(source) => {

    const browser = await pupeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox']});
    const page = await browser.newPage(); // Create new instance of puppet
        
    try {
        fetchContracts("https://efdsearch.senate.gov/search/", page, source)
            .then(parseResults1)
            .then(parseResults2)
            .then(async(results) => {
                let fullresults = results;
                let pageLength = 105;
                let index = 0; // Could be simple for loop, but what are you gonna do...
                while (index < pageLength - 1){

                    index++
                    await page.click("a.next");
                    await page.waitFor(1000);
                    let html = await page.content();
                    
                    parseResults1(html).then(parseResults2).then(async(results) => {
                        fullresults.push(...results);
                        console.log(`Parsed ${fullresults.length} results...`);
                    });  
                };
                return fullresults;
            })
            .then(async(res) => {
                fs.writeFile(`${source}.json`, JSON.stringify(res), (err) => {
                    if (err) throw err;
                    console.log('Data written to file');
                });
            });

    } catch(err) {
       console.log(err);
    }

};

const fetchContracts = async (url, page, source) => {
    
    await page.goto(url, { waitUntil: 'networkidle2' }); // Ensure no network requests are happening (in last 500ms).
    await Promise.all([
        page.click("#agree_statement"),
        page.waitForNavigation()
    ]);

    let buttonTarget = source === 'senators' ? '.senator_filer' : '.candidate_filer';

    await page.click(buttonTarget);

    await Promise.all([
        page.click(".btn-primary"),
        page.waitForNavigation()
    ]);    
    
    await Promise.all([
        page.click('#filedReports th:nth-child(5)'),
        page.waitForResponse('https://efdsearch.senate.gov/search/report/data/')
    ]);

    await Promise.all([
        page.click('#filedReports th:nth-child(5)'),
        page.waitForResponse('https://efdsearch.senate.gov/search/report/data/')
    ]);
    
    await page.waitFor(1000)

    let html = await page.content();
    return html;

};