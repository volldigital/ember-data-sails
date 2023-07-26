import { run } from '@ember/runloop';
import RSVP from 'rsvp';
import SailsBaseAdapter from '@voll/ember-data-sails/adapters/sails-base';
import { module, test } from 'qunit';
import extend from '../../helpers/extend';
import { setupTest } from 'ember-qunit';

var bind = run.bind;

module('SailsBaseAdapter', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.subject = function (obj) {
      return run(SailsBaseAdapter, 'create', obj || {});
    };
  });

  var CSRF_PROPERTY = '_csrf';
  var CSRF_VALUE = 'abcdefgh012345';
  var URL = '/some/dummy/url';

  function addCsrf(obj) {
    if (!obj) {
      obj = {};
    }
    obj[CSRF_PROPERTY] = CSRF_VALUE;
    return obj;
  }

  test('it initializes correctly', function (assert) {
    assert.expect(2);

    var adapter = this.subject();

    assert.false(
      adapter.get('isLoadingCSRF'),
      'isLoadingCSRF should be false initially',
    );
    assert.false(adapter.get('useCSRF'), 'useCSRF should be false initially');
  });

  test('it checks the CSRF and inject it in given payload', function (assert) {
    assert.expect(5);

    var adapter = this.subject(),
      dataBefore,
      dataAfter;
    dataAfter = run(adapter, 'checkCSRF', (dataBefore = {}));
    assert.strictEqual(
      dataAfter,
      dataBefore,
      'output object should be the same as input one',
    );
    assert.deepEqual(
      dataBefore,
      {},
      'the CSRF token should not be injected when it is not activated',
    );

    run(adapter, 'set', 'useCSRF', true);
    assert.throws(
      bind(adapter, 'checkCSRF', {}),
      'checking CSRF with no token should fail',
    );

    run(adapter, 'set', 'csrfToken', CSRF_VALUE);
    dataAfter = run(adapter, 'checkCSRF', (dataBefore = {}));
    assert.strictEqual(
      dataAfter,
      dataBefore,
      'output object should be the same as input one',
    );
    assert.deepEqual(
      dataBefore,
      addCsrf(),
      'the CSRF token should have been injected when it is activated',
    );
  });

  test('it starts an ajax request with or without useCSRF enabled', function (assert) {
    assert.expect(21);

    var res, calls, adapter, options;
    calls = {};
    // mock _request and _fetchCSRFToken
    adapter = this.subject({
      _request: function (out, url, method, options) {
        calls._request = {
          out: out,
          url: url,
          method: method,
          options: options,
        };
        return RSVP[res.error ? 'reject' : 'resolve'](res.error || res.data);
      },

      _fetchCSRFToken: function () {
        calls._fetchCSRFToken = true;
        return RSVP.resolve(CSRF_VALUE);
      },
    });

    // GET with CSRF disabled
    res = { data: {} };
    calls = {};
    return run(adapter, 'ajax', URL, 'GET', extend(true, {}, (options = {})))
      .then(function (response) {
        assert.strictEqual(
          calls._fetchCSRFToken,
          undefined,
          '_fetchCSRFToken should not have been called when doing a GET with CSRF disabled',
        );
        assert.strictEqual(
          response,
          res.data,
          'the response should be correct when doing a GET with CSRF disabled',
        );
        assert.strictEqual(
          calls._request.url,
          URL,
          'the URL should be correct when doing a GET with CSRF disabled',
        );
        assert.strictEqual(
          calls._request.method,
          'GET',
          'the method should be correct when doing a GET with CSRF disabled',
        );
        assert.deepEqual(
          calls._request.options,
          options,
          'the options should be correct when doing a GET with CSRF disabled',
        );

        // POST with CSRF disabled
        res = { data: {} };
        calls = {};
        return run(
          adapter,
          'ajax',
          URL,
          'POST',
          extend(true, {}, (options = { data: {} })),
        );
      })
      .then(function (response) {
        assert.strictEqual(
          calls._fetchCSRFToken,
          undefined,
          '_fetchCSRFToken should not have been called when doing a POST with CSRF disabled',
        );
        assert.strictEqual(
          response,
          res.data,
          'the response should be correct when doing a POST with CSRF disabled',
        );
        assert.strictEqual(
          calls._request.url,
          URL,
          'the URL should be correct when doing a POST with CSRF disabled',
        );
        assert.strictEqual(
          calls._request.method,
          'POST',
          'the method should be correct when doing a POST with CSRF disabled',
        );
        assert.deepEqual(
          calls._request.options,
          options,
          'the options should be correct when doing a POST with CSRF disabled',
        );

        // GET with CSRF enabled
        res = { data: {} };
        calls = {};
        run(adapter, 'set', 'useCSRF', true);
        return run(
          adapter,
          'ajax',
          URL,
          'GET',
          extend(true, {}, (options = {})),
        );
      })
      .then(function (response) {
        assert.strictEqual(
          calls._fetchCSRFToken,
          undefined,
          '_fetchCSRFToken should not have been called when doing a GET with CSRF enabled',
        );
        assert.strictEqual(
          response,
          res.data,
          'the response should be correct when doing a GET with CSRF enabled',
        );
        assert.strictEqual(
          calls._request.url,
          URL,
          'the URL should be correct when doing a GET with CSRF enabled',
        );
        assert.strictEqual(
          calls._request.method,
          'GET',
          'the method should be correct when doing a GET with CSRF enabled',
        );
        assert.deepEqual(
          calls._request.options,
          options,
          'the options should be correct when doing a GET with CSRF enabled',
        );

        // POST with CSRF enabled
        calls = {};
        res = { data: {} };
        return run(
          adapter,
          'ajax',
          URL,
          'POST',
          extend(true, {}, (options = { data: {} })),
        );
      })
      .then(function (response) {
        assert.ok(
          calls._fetchCSRFToken,
          '_fetchCSRFToken should have been called when doing a POST with CSRF enabled',
        );
        assert.strictEqual(
          response,
          res.data,
          'the response should be correct when doing a POST with CSRF enabled',
        );
        assert.strictEqual(
          calls._request.url,
          URL,
          'the URL should be correct when doing a POST with CSRF enabled',
        );
        assert.strictEqual(
          calls._request.method,
          'POST',
          'the method should be correct when doing a POST with CSRF enabled',
        );
        // ensure we're not strict equal
        assert.notStrictEqual(
          calls._request.options,
          options,
          'internal assertion to be sure the objects are not the same',
        );
        addCsrf(options.data);
        assert.deepEqual(
          calls._request.options,
          options,
          'the options should be correct when doing a POST with CSRF enabled',
        );
      });
  });
});
