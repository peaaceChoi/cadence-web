// Copyright (c) 2021 Uber Technologies Inc.
//
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import { ONE_HOUR_IN_MILLISECONDS } from '~constants';
import {
  getClustersFromDomainConfig,
  getQueryStringFromObject,
} from '~helpers';
import { CacheManager } from '~managers';

const DEFAULT_FETCH_OPTIONS = {
  credentials: 'same-origin',
  headers: {
    Accepts: 'application/json',
  },
};

class HttpService {
  constructor() {
    this.origin = window.location.origin;
    this.cacheManager = new CacheManager(ONE_HOUR_IN_MILLISECONDS);
  }

  handleResponse(response) {
    return response.status >= 200 && response.status < 300
      ? response.json().catch(() => {})
      : response.json().then(
          json => Promise.reject(Object.assign(response, { json })),
          () => Promise.reject(response)
        );
  }

  async getDomainConfig({ domain }) {
    const fetch = this.fetchOverride ? this.fetchOverride : window.fetch;

    return fetch(`/api/domains/${domain}`, DEFAULT_FETCH_OPTIONS).then(
      this.handleResponse
    );
  }

  async getFeatureFlag({ name, params }) {
    const queryParams = getQueryStringFromObject(params);
    const url = `/api/feature-flags/${name}${queryParams}`;

    return (await fetch(url, DEFAULT_FETCH_OPTIONS).then(this.handleResponse))
      .value;
  }

  async getRegionalOrigin({ activeStatus, domain }) {
    const config = await this.cacheManager.get(domain, () =>
      this.getDomainConfig({ domain })
    );

    const { activeCluster, passiveCluster } = getClustersFromDomainConfig(
      config
    );

    const cluster = activeStatus === 'active' ? activeCluster : passiveCluster;

    return (
      (await this.getFeatureFlag({
        name: 'crossRegion.clusterToRegionalDomainUrl',
        params: { cluster },
      })) || ''
    );
  }

  async request(baseUrl, options = {}) {
    const fetch = this.fetchOverride ? this.fetchOverride : window.fetch;
    const queryString = getQueryStringFromObject(options.query);
    const pathname = queryString ? `${baseUrl}${queryString}` : baseUrl;
    const origin = options.activeStatus
      ? await this.getRegionalOrigin(options)
      : '';

    const url = `${origin}${pathname}`;

    return fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      ...(options.activeStatus && {
        credentials: 'include',
        mode: 'cors',
      }),
      ...options,
    }).then(this.handleResponse);
  }

  requestWithBody(url, body, options = {}) {
    return this.request(url, {
      ...options,
      body: JSON.stringify(body),
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
      },
    });
  }

  delete(url, body, options = {}) {
    return this.requestWithBody(url, body, {
      ...options,
      method: 'delete',
    });
  }

  get(url, options = {}) {
    return this.request(url, { ...options, method: 'get' });
  }

  post(url, body, options = {}) {
    return this.requestWithBody(url, body, {
      ...options,
      method: 'post',
    });
  }

  put(url, body, options = {}) {
    return this.requestWithBody(url, body, {
      ...options,
      method: 'put',
    });
  }

  setFetch(fetch) {
    this.fetchOverride = fetch;
  }
}

const httpService = new HttpService();

export default httpService;
