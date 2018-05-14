/** Telegram机器人的Token */
const token = '机器人Token';
const robotName = '@xxxx';



const TelegramBot = require('node-telegram-bot-api');
const cheerio = require('cheerio');
const axios = require('axios');
const moment = require('moment');
moment.locale('zh-cn');
const vm = require('vm');
const http = axios.create({
    baseURL: 'https://www.javbus.com/',
    timeout: 5000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    }
});

const bot = new TelegramBot(token, {polling: true});

//开始入口
bot.onText(/\/start/, msg => {
    bot.sendMessage(msg.chat.id, '欢迎使用番号机器人\n请输入 / 查看命令提示');
});


//简单保存工作状态
const state = {start: Date.now(), date: {}};

bot.onText(/\/state/, msg => {//最近5天工作状态
    let buffer = drawState(5);
    return bot.sendMessage(msg.chat.id, buffer);
});
bot.onText(/\/state (\d+)/, (msg, match) => {//工作状态
    let days = parseInt(match[1].trim()); // the captured "whatever"
    console.log({days});
    let buffer = drawState(days);

    return bot.sendMessage(msg.chat.id, buffer);
});

/**
 * 绘制图表
 * @param range
 * @returns {*}
 */
function drawState(range) {
    let now = moment();
    let earlyDay = moment().subtract(range, 'day');
    let date = [], data = [];
    while (earlyDay.diff(now) <= 0) {
        let dateKey = earlyDay.format('YYYY-MM-DD');
        date.push(dateKey);
        if (state.date[dateKey])
            data.push(state.date[dateKey]);
        else
            data.push(0);
        earlyDay = earlyDay.add(1, 'day');
    }
    let message = '从 ' + moment(state.start).fromNow() + ' 开始工作\n\n       日期       : 查询车牌号次数';
    date.forEach((d, i) => {
        message += '\n' + d + ' : ' + data[i];
    });
    return message;
}

let idRegex = /^([a-z]+)(?:-|_|\s)?([0-9]+)$/;

// Matches "/echo [whatever]"
bot.onText(/\/av (.+)/, async (msg, match) => {
    const today = moment().format('YYYY-MM-DD');
    if (state.date[today])
        state.date[today]++;
    else
        state.date[today] = 1;
    const chatId = msg.chat.id;
    let chartType = msg.chat.type;
    let isPrivate = chartType === 'private';
    let id = match[1].trim(); // the captured "whatever"
    console.log('请求番号', id);
    if (idRegex.test(id)) {
        id = id.match(idRegex);
        id = id[1] + '-' + id[2];
    }
    if (isPrivate)
        bot.sendMessage(chatId, `开始查找车牌号：${id} ……`);
    try {
        let result = await parseHtml(id);
        await bot.sendPhoto(chatId, result.cover);
        let max = isPrivate ? 10 : 3;
        let title = '[' + id + '] ';
        if (result.magnet.length > 0) {
            let message = result.title;
            result.magnet.every((magnet, i) => {
                message += '\n-----------\n大小: ' + magnet.size + '\n链接: ' + magnet.link.substring(0, 60);
                return (i + 1) < max;
            });
            if (!isPrivate && result.magnet.length > max) {
                message += `\n-----------\n在群聊中发车，还有 ${result.magnet.length - max} 个Magnet链接没有显示\n与 ${robotName} 机器人单聊可以显示所有链接`;
            }
            bot.sendMessage(chatId, message);
        } else {
            bot.sendMessage(chatId, title + '还没有Magnet链接');
        }
    } catch (e) {
        console.error(id, e.message);
        if (e.message.indexOf('timeout') !== -1)
            return bot.sendMessage(chatId, '机器人查询番号超时，请重试');
        bot.sendMessage(chatId, `找不到 ${id}！`);
    }
});


/**
 * 解析Javbus网页内容
 * @param id
 * @returns {{title: string, cover: string, magnet: array}}
 */
async function parseHtml(id) {
    const result = {title: '', cover: '', magnet: []};
    let response = await http.get('/' + id);
    // fs.writeFileSync('./1.html', response.data);
    let $ = cheerio.load(response.data);
    let $image = $('a.bigImage img');
    // console.log({$image});
    result.title = $image.attr('title');
    result.cover = $image.attr('src');

    let ajax = {gid: '', uc: '', img: ''};
    const context = new vm.createContext(ajax);
    let $script = $('body > script:nth-child(9)');
    new vm.Script($script.html()).runInContext(context);
    let floor = Math.floor(Math.random() * 1e3 + 1);
    let url = `/ajax/uncledatoolsbyajax.php?gid=${ajax.gid}&uc=${ajax.uc}&img=${ajax.img}&lang=zh&floor=${floor}`;
    response = await http({method: 'get', url, headers: {'referer': 'https://www.javbus.com/' + id}});
    // console.log(response.data);
    // fs.writeFileSync('./2.html', response.data);
    $ = cheerio.load(response.data, {xmlMode: true, decodeEntities: true, normalizeWhitespace: true});
    let $tr = $('tr');
    if ($tr.length > 0) {
        for (let i = 0; i < $tr.length; i++) {
            let $a = $tr.eq(i).find('td:nth-child(2) a');
            if ($a.length === 0)
                continue;
            // console.log('tr', i, $a.length);
            result.magnet.push({link: decodeURI($a.attr('href').trim()), size: $a.text().trim()});
        }
    }
    // console.log(result);
    return result;
}
