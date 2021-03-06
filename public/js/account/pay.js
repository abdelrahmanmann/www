jQuery(function ($) {
  /*global Stripe*/
  'use strict';

  if (![].map) {
    Array.prototype.map = function (fn) {
      return $.map(this, fn);
    };
  }

  /**
   * Make the form friendly for credit card input
   */
  var cardnumber = $('#cardnumber').payment('formatCardNumber').on('blur input', function () {
    $(this).closest('span').toggleClass('valid', $.payment.validateCardNumber(this.value));
  });

  // Expiry is a single field, so we need to split it up to validate
  var expiry = $('#expiry').payment('formatCardExpiry').on('blur input', function () {
    var data = this.value.split('/').map(function (s) {
      return s.trim();
    });

    $(this).closest('span').toggleClass('valid', $.payment.validateCardExpiry(data[0], data[1]));
  });

  // CVC
  var cvc = $('#cvc').payment('formatCardCVC').on('blur input', function () {
    var card = $.payment.cardType(cardnumber.val());
    $(this).closest('span').toggleClass('valid', $.payment.validateCardCVC(this.value, card));
  });

  var email = $('#email').on('blur input', function () {
    $(this).closest('span').toggleClass('valid', this.validity && this.validity.valid);
  });

  email.closest('span').toggleClass('valid', this.validity && this.validity.valid);


  $('input[name=buyer_type]').on('change', function () {
    var disabled = !(this.value === 'business' && this.checked);
      $('.business').toggleClass('disabled', disabled).find(':input').prop('disabled', disabled);
  }).trigger('change');


  /**
   * Automatically select the country based on the visitor's IP, and if they change
   * the country and the country they select is in the EU, update the VAT prefix
   */

  var eu = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI',
            'FR', 'GB', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL',
            'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];

  var countryEl = $('#country');
  var vatEl = $('#vat');
  var vatISOEl = $('#vatiso');

  $.getJSON('https://country-finder.herokuapp.com/?callback=?', function (data) {
    if (data.geo) {
      countryEl.val(data.geo.country.toLowerCase()).trigger('change');
    }
  });

  countryEl.on('change', function () {
    var code = countryEl.val().toUpperCase();
    vatEl.closest('div').toggleClass('disabled', eu.indexOf(code) === -1);

    if (eu.indexOf(code) !== -1) {
      vatISOEl.html(code);
    } else {
      vatISOEl.html('');
    }
  });

  var price = { yearly: {}, monthly: {}, discount: {} };
  price.yearly.el = $('#price-yearly');
  price.yearly.value = price.yearly.el.data('price') * 1;
  price.monthly.el = $('#price-monthly');
  price.monthly.value = price.monthly.el.data('price') * 1;
  price.discount.el = $('#discount');
  price.discount.value = price.discount.el.data('price') * 1;

  var fx = {
    USD: { rate: 1 / 0.888684 / (1 / 1.138751), symbol: '$' },
    EUR: { rate: 1 / 0.888684, symbol: '???' },
    GBP: { rate: 1, symbol: '??' }
  };

  // fx.EUR.rate = 1 / 0.888684;
  // fx.USD.rate = 1 / 0.888684 / (1 / 1.138751);


  function updatePricesTo(ccy) {
    var yearly = price.yearly.value * fx[ccy].rate;
    var monthly = price.monthly.value * fx[ccy].rate;

    if (ccy !== 'GBP') {
      yearly = yearly | 0;
      monthly = monthly | 0;
    }

    var discount = price.discount.value * fx[ccy].rate | 0;
    price.yearly.el.html(fx[ccy].symbol + yearly);
    price.monthly.el.html(fx[ccy].symbol + monthly);
    price.discount.el.html(fx[ccy].symbol + discount);
  }

  var $ccynote = $('.ccy-note');

  // var rates = {
  //   "USD": 1.138751,
  //   "GBP": 0.888684,
  //   "EUR": 1
  //   };
  fx.EUR.rate = 1 / 0.888684;
  fx.USD.rate = fx.EUR.rate / (1 / 1.138751);

  $('.ccy input').change(function () {
    var ccy = this.value;

    if (ccy === 'GBP') {
      $ccynote.prop('hidden', true);
    } else {
      $ccynote.prop('hidden', false);
    }

    updatePricesTo(ccy);
  })


  /**
   * Validate the VAT registration number (which we'll also do on the server
   * side) using a simple heroku app.
   */
  $('#validateVat').on('click', function (event) {
    event.preventDefault();
    var vatNum = vatEl[0].value.replace(/\s/g, '');
    var vat = countryEl.val().toLowerCase() + vatNum;

    if (vatNum) {
      vatEl.addClass('validating');
      $.getJSON('https://taxtools.io/api/validate/' + vat, function (data) {
        if (!data.verified) {
          return setTimeout(function () {
            console.log('API request failed, trying again');
            $('#validateVat').click();
          }, 3000);
        }

        if (data) {
          if (data.valid) {
            vatEl[0].className = 'valid';
          } else {
            vatEl[0].className = 'invalid';
          }
        } else {
          console.log('cannot validate VAT');
          vatEl[0].className = '';
        }
        vatEl.removeClass('validating');
      });
    } else {
      vatEl[0].className = '';
    }
  });


  /**
   * Do the Stripe dance.
   */

  $('#payment-form').submit(function () {
    var $form = $(this);

    // Disable the submit button to prevent repeated clicks
    $form.find('button#pay').prop('disabled', true);

    var expiryData = expiry.val().split('/').map(function (s) {
      return s.trim();
    });

    Stripe.card.createToken({
      number: $('#cardnumber').val(),
      cvc: $('#cvc').val(),
      'exp_month': expiryData[0],
      'exp_year': expiryData[1]
    }, stripeResponseHandler);


    // Prevent the form from submitting with the default action
    return false;
  });

  function stripeResponseHandler(status, response) {
    var $form = $('#payment-form');

    if (response.error) {
      // Show the errors on the form
      $form.find('.payment-errors').html('<b class="icon-info-circle"></b> ' + response.error.message);
      $form.find('button').prop('disabled', false);
    } else {
      // response contains id and card, which contains additional card details
      var token = response.id;
      // Insert the token into the form so it gets submitted to the server
      $form.append($('<input type="hidden" name="stripeToken" />').val(token));
      // and submit
      $form.get(0).submit();
    }
  }



});
