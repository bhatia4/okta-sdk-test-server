const fs = require('fs-extra');
const path = require('path');
const { URL } = require('url');
const querystring = require('querystring');
const stringify = require('json-stable-stringify');
const packageJson = require('../package.json');

const harUtil = module.exports;

const proxyTarget = 'https://test.example.com';

// Fetch the har for a scenario
harUtil.readHarFile = harFilePath => {
  // Return the har if we have one
  if (fs.existsSync(harFilePath)) {
    return fs.readJsonSync(harFilePath);
  }

  // Return a default har
  return {
    log: {
      version: 1.2,
      creator: {
        name: 'okta-sdk-test-server',
        version: packageJson.version
      },
      entries: []
    }
  };
};

harUtil.normalizeQueryString = url => {
  let missingDomain;
  if (url[0] === '/') {
    missingDomain = proxyTarget;
  }
  const newUrl = new URL(url, missingDomain);
  const query = newUrl.search.slice(1);
  if (query) {
    const parsed = querystring.parse(query);
    const sortedObj = JSON.parse(stringify(parsed));
    newUrl.search = querystring.stringify(sortedObj);
  }
  return newUrl.href;
};

// Ensure all the requests are consistent
harUtil.normalizeRequest = (req) => {
  // Purposefully exclude the authorization header to avoid
  // api tokens in the har output
  req.headers = {
    accept: req.headers.accept,
    'content-type': req.headers['content-type']
  };

  // Normalize the query params
  req.url = harUtil.normalizeQueryString(req.url);

  // Some libraries change spacing or ordering of json data
  // default to an empty string
  req.data = (req.data) ? stringify(JSON.parse(req.data)) : '';
  req.body = req.body || '';
};

harUtil.normalizeHarRequest = harRequest => {
  if (!harRequest.postData.text) {
    harRequest.postData.text = '';
  }

  harRequest.url = harUtil.normalizeQueryString(harRequest.url);
};

harUtil.createHarEntry = ({responseBody, req, res}) => {
  harUtil.normalizeRequest(req);

  // Build the request portion
  const request = {
    method: req.method.toUpperCase(),
    url: proxyTarget + req.url,
    headers: Object.entries(req.headers).map(([headerName, header]) => {
      return {
        name: headerName,
        value: header
      };
    }),
    queryString: (function () {
      const aggregate = [];
      const parsedUrl = new URL(proxyTarget + req.url);
      for (const [queryName, query] of parsedUrl.searchParams.entries()) {
        aggregate.push({
          name: queryName,
          value: query
        });
      }
      return aggregate;
    }()),
    postData: {
      text: req.body || ''
    }
  };

  // Build the response portion
  const response = {
    status: res.statusCode,
    statusText: res.statusMessage,
    headers: ['content-type', 'link']
      .map(headerName => {
        return {
          name: headerName,
          value: res.getHeader(headerName)
        };
      })
      .filter(header => !!header.value),
    content: {
      mimeType: res.getHeader('content-type'),
      text: responseBody
    }
  };

  return {
    request,
    response
  };
};

harUtil.loadHarFromFile = scenarioFileName => {
  const scenarioName = path.basename(scenarioFileName, '.har');
  const scenario = fs.readJsonSync(scenarioFileName);
  return [scenarioName, scenario.log.entries];
};
