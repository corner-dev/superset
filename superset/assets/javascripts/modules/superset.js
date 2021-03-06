import $ from 'jquery';
const utils = require('./utils');
// vis sources
/* eslint camel-case: 0 */
import Mustache from 'mustache';
import vizMap from '../../visualizations/main.js';
import { getExploreUrl } from '../explorev2/exploreUtils';
import { applyDefaultFormData } from '../explorev2/stores/store';

/* eslint wrap-iife: 0*/
const px = function () {
  let slice;
  function getParam(name) {
    /* eslint no-useless-escape: 0 */
    const formattedName = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + formattedName + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
  }
  function initFavStars() {
    const baseUrl = '/superset/favstar/';
    // Init star behavihor for favorite
    function show() {
      if ($(this).hasClass('selected')) {
        $(this).html('<i class="fa fa-star"></i>');
      } else {
        $(this).html('<i class="fa fa-star-o"></i>');
      }
    }
    $('.favstar')
    .attr('title', 'Click to favorite/unfavorite')
    .css('cursor', 'pointer')
    .each(show)
    .each(function () {
      let url = baseUrl + $(this).attr('class_name');
      const star = this;
      url += '/' + $(this).attr('obj_id') + '/';
      $.getJSON(url + 'count/', function (data) {
        if (data.count > 0) {
          $(star).addClass('selected').each(show);
        }
      });
    })
    .click(function () {
      $(this).toggleClass('selected');
      let url = baseUrl + $(this).attr('class_name');
      url += '/' + $(this).attr('obj_id') + '/';
      if ($(this).hasClass('selected')) {
        url += 'select/';
      } else {
        url += 'unselect/';
      }
      $.get(url);
      $(this).each(show);
    })
    .tooltip();
  }
  const Slice = function (data, datasource, controller) {
    let timer;
    const token = $('#token_' + data.slice_id);
    const containerId = 'con_' + data.slice_id;
    const selector = '#' + containerId;
    const container = $(selector);
    const sliceId = data.slice_id;
    const formData = applyDefaultFormData(data.form_data);
    let dttm = 0;
    const stopwatch = function () {
      dttm += 10;
      const num = dttm / 1000;
      $('#timer').text(num.toFixed(2) + ' sec');
    };
    slice = {
      data,
      formData,
      container,
      containerId,
      datasource,
      selector,
      getWidgetHeader() {
        return this.container.parents('div.widget').find('.chart-header');
      },
      render_template(s) {
        const context = {
          width: this.width,
          height: this.height,
        };
        return Mustache.render(s, context);
      },
      jsonEndpoint() {
        return this.endpoint('json');
      },
      endpoint(endpointType = 'json') {
        const formDataExtra = Object.assign({}, formData);
        const flts = controller.effectiveExtraFilters(sliceId);
        if (flts) {
          formDataExtra.extra_filters = flts;
        }
        let endpoint = getExploreUrl(formDataExtra, endpointType, this.force);
        if (endpoint.charAt(0) !== '/') {
          // Known issue for IE <= 11:
          // https://connect.microsoft.com/IE/feedbackdetail/view/1002846/pathname-incorrect-for-out-of-document-elements
          endpoint = '/' + endpoint;
        }
        return endpoint;
      },
      d3format(col, number) {
        // uses the utils memoized d3format function and formats based on
        // column level defined preferences
        let format = '.3s';
        if (this.datasource.column_formats[col]) {
          format = this.datasource.column_formats[col];
        }
        return utils.d3format(format, number);
      },
      /* eslint no-shadow: 0 */
      always(data) {
        clearInterval(timer);
        $('#timer').removeClass('btn-warning');
        if (data && data.query) {
          slice.viewSqlQuery = data.query;
        }
      },
      done(payload) {
        Object.assign(data, payload);

        clearInterval(timer);
        token.find('img.loading').hide();
        container.fadeTo(0.5, 1);
        container.show();

        $('#timer').addClass('label-success');
        $('#timer').removeClass('label-warning label-danger');
        $('.query-and-save button').removeAttr('disabled');
        this.always(data);
        controller.done(this);
      },
      getErrorMsg(xhr) {
        if (xhr.statusText === 'timeout') {
          return 'The request timed out';
        }
        let msg = '';
        if (!xhr.responseText) {
          const status = xhr.status;
          msg += 'An unknown error occurred. (Status: ' + status + ')';
          if (status === 0) {
            // This may happen when the worker in gunicorn times out
            msg += ' Maybe the request timed out?';
          }
        }
        return msg;
      },
      error(msg, xhr) {
        let errorMsg = msg;
        token.find('img.loading').hide();
        container.fadeTo(0.5, 1);
        let errHtml = '';
        let o;
        try {
          o = JSON.parse(msg);
          if (o.error) {
            errorMsg = o.error;
          }
        } catch (e) {
          // pass
        }
        errHtml = `<div class="alert alert-danger">${errorMsg}</div>`;
        if (xhr) {
          const extendedMsg = this.getErrorMsg(xhr);
          if (extendedMsg) {
            errHtml += `<div class="alert alert-danger">${extendedMsg}</div>`;
          }
        }
        container.html(errHtml);
        container.show();
        $('span.query').removeClass('disabled');
        $('#timer').addClass('btn-danger');
        $('.query-and-save button').removeAttr('disabled');
        this.always(o);
        controller.error(this);
      },
      clearError() {
        $(selector + ' div.alert').remove();
      },
      width() {
        return token.width();
      },
      height() {
        let others = 0;
        const widget = container.parents('.widget');
        const sliceDescription = widget.find('.slice_description');
        if (sliceDescription.is(':visible')) {
          others += widget.find('.slice_description').height() + 25;
        }
        others += widget.find('.chart-header').height();
        return widget.height() - others - 10;
      },
      bindResizeToWindowResize() {
        let resizeTimer;
        const slice = this;
        $(window).on('resize', function () {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(function () {
            slice.resize();
          }, 500);
        });
      },
      render(force) {
        if (force === undefined) {
          this.force = false;
        } else {
          this.force = force;
        }
        token.find('img.loading').show();
        container.fadeTo(0.5, 0.25);
        container.css('height', this.height());
        dttm = 0;
        timer = setInterval(stopwatch, 10);
        $('#timer').removeClass('label-danger label-success');
        $('#timer').addClass('label-warning');
        $.getJSON(this.jsonEndpoint(), queryResponse => {
          try {
            vizMap[formData.viz_type](this, queryResponse);
            this.done(queryResponse);
          } catch (e) {
            this.error('An error occurred while rendering the visualization: ' + e);
          }
        }).fail(err => {
          this.error(err.responseText, err);
        });
      },
      resize() {
        this.render();
      },
      addFilter(col, vals, merge = true, refresh = true) {
        controller.addFilter(sliceId, col, vals, merge, refresh);
      },
      setFilter(col, vals, refresh = true) {
        controller.setFilter(sliceId, col, vals, refresh);
      },
      getFilters() {
        return controller.filters[sliceId];
      },
      clearFilter() {
        controller.clearFilter(sliceId);
      },
      removeFilter(col, vals) {
        controller.removeFilter(sliceId, col, vals);
      },
    };
    return slice;
  };
  // Export public functions
  return {
    getParam,
    initFavStars,
    Slice,
  };
}();
module.exports = px;
