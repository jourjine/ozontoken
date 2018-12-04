// HTTP запрос
const axios = require('axios');
const querystring = require('querystring');
// подлючаем  драйвер работы с БД
var myMongo = require("./mongolass");
// парсер ошибок МонгоДБ
const mongoErrorParse = require('mongo-error-parser');
// логер событий
var mongoDblogger = require("huzzah").get("MongoDB"); 
var ConsoleHandler = require("huzzah/handlers").ConsoleHandler;

const moment = require('moment');
const fs = require('fs');
const util = require('util');


// Настройка логгера
require("huzzah")
  // get settings of logger with name 'root'
  .settings("root") // see hierarchical section about what root mean (it is parent of all loggers)
  // output every log message to console, from all loggers (.addHandler call can be chained)
  .addHandler(new ConsoleHandler());
// УРЛ получения токена
const tokenUrl = 'https://api.ozon.ru/AuthServer/Token';
// данные для запроса для получения токена


const oneMinute = 60000;
const tokenCollection = 'token';

// парсим ответ в структуру для записи в БД
function parseResponse(parse) {
	var ozonTokenAnswer = {};
	ozonTokenAnswer.access_token = parse.data.access_token;
	ozonTokenAnswer.token_type = parse.data.token_type;
	ozonTokenAnswer.expires_in = parse.data.expires_in;
	ozonTokenAnswer.refresh_token = parse.data.refresh_token;
	ozonTokenAnswer.issued = parse.data['.issued'];
	ozonTokenAnswer.expires = parse.data['.expires'];
	ozonTokenAnswer.content_type = parse.headers['content-type'];
	ozonTokenAnswer.content_length = parseInt(parse.headers['content-length'],10);
	return ozonTokenAnswer;
};
// парсим ответ в зависимости от статуса ответа
function parseResult(result) {
	(async () => { 
		switch (result.status) {
			case 200:
				
				// парсим полученные данные отОзона для БД
				data2Return = parseResponse(result);
				// обновляем БД
				const data =  await myMongo.undateOne(tokenCollection, {}, data2Return)
				mongoDblogger.trace('token updated to DB');
			break;
			case 400:
				mongoDblogger.error('400 error');
			break;
			case 401:
				mongoDblogger.error('Unauthorized');
			break;
		};	
	})()
	.catch((error) => { mongoDblogger.error(mongoErrorParse(error)) });
};

(async () => { 
	// Создаем запрос для получения токена в Озоне
	var accessRequest = {
	    			grant_type: 'password',
        			username: 'dmitry@jourjine.ru',
			        password: ''
		};
	// Оборачиваем в извиняшку
	const readFile = util.promisify(fs.readFile);
	// Читаем файл с паролем 
	const password = await readFile('./secret.my', "utf8");
	// И заполняем его в запрос
	accessRequest.password = password.trim();	
	// Получаем токены из Озона
	const result = await axios.post(tokenUrl, querystring.stringify(accessRequest));
	mongoDblogger.trace('token recieved from ozon');
	// Парсим полученный результат от Озона
	parseResult(result);

})()
.catch((error) => { mongoDblogger.error(mongoErrorParse(error)) });

// читаем из БД только 1 раз
var isFirstRequest = true; 
// по умолчанию время равно ничему
var timeExpires = 0;

setTimeout( function run() {
	
		( async () => { 		
				// Структура запроса на обновление токена
				var refreshRequest = { 	grant_type: 'refresh_token',
										refresh_token: ''
									  };
				if (isFirstRequest) {
					// Получаем из БД запись о токенах									  
					const dataToken =  await myMongo.findOne(tokenCollection, {});	
					mongoDblogger.trace('refresh token recieved fron DB');
					// Поготавливаем рефреш токен в запросе данными из БД
					refreshRequest.refresh_token = dataToken[0].refresh_token;
					// Получаем время действия токена
					timeExpires = moment(dataToken[0].expires).format('HHmm');
				};
				// получаем текущее время
				const timeNow = moment().format('HHmm');		
				// время истекло?
				console.log(isFirstRequest);
				if (timeNow < timeExpires) {
					isFirstRequest = false;
					console.log(isFirstRequest);
				} else {
					// Обновляем токенпо урлу из Озона
					const result = await axios.post(tokenUrl, querystring.stringify(refreshRequest)) 
					mongoDblogger.trace('token refreshed fron ozon');
					// парсим ответ в зависимости от статуса ответа
					parseResult(result);
					isFirstRequest = true;
	
				};

		}) ()
		.catch((error) => { mongoDblogger.error(mongoErrorParse(error)) });
		// взводим внутренний таймер на 1 минуту = зацикливаем получение
		setTimeout(run, (oneMinute));
	// взводим первый таймер на 1 минуту
}, (oneMinute));

