import Booking from '../../shared/models/BookingClass'
import Flight from '../../shared/models/FlightClass' // eslint-disable-line
// @ts-ignore
import { Loading } from 'quasar'
import { processPayment } from './payment'

// import { API, graphqlOperation } from 'aws-amplify'
// import {
//   processBooking as processBookingMutation,
//   getBookingByStatus
// } from './graphql'

import axios from 'axios'

/**
 *
 * Booking [Vuex Module Action](https://vuex.vuejs.org/guide/actions.html) - fetchBooking retrieves all bookings for current authenticated customer.
 *
 * It uses SET_BOOKINGS mutation to update Booking state with the latest bookings and flights associated with them.
 * @param {object} context - Vuex action context (context.commit, context.getters, context.state, context.dispatch)
 * @param {string} paginationToken - pagination token for loading additional bookings
 * @returns {promise} - Promise representing whether bookings from Booking service have been updated in the store
 * @see {@link SET_BOOKINGS} for more info on mutation
 * @example
 * // excerpt from src/pages/Bookings.vue
 * import { mapState, mapGetters } from "vuex";
 * ...
 * async mounted() {
 *    if (this.isAuthenticated) {
 *       await this.$store.dispatch("bookings/fetchBooking");
 *    }
 * },
 * computed: {
 *    ...mapState({
 *        bookings: state => state.bookings.bookings
 *    }),
 *    ...mapGetters("profile", ["isAuthenticated"])
 * }
 */
export async function fetchBooking(
  { commit, rootGetters },
  paginationToken = ''
) {
  console.group('store/bookings/actions/fetchBooking')
  Loading.show({
    message: 'Loading bookings...'
  })

  var nextToken = paginationToken || null

  const credentials = {
    idToken: rootGetters['profile/idToken'],
    accessToken: rootGetters['profile/accessToken']
  }

  try {
    const customerId = rootGetters['profile/userAttributes'].sub
    const bookingFilter = {
      customer: customerId,
      status: {
        eq: 'CONFIRMED'
      },
      limit: 3,
      nextToken: nextToken
    }

    console.log('Fetching booking data')
    console.table(bookingFilter)
    // const {
    //   // @ts-ignore
    //   data: {
    //     getBookingByStatus: { items: bookingData, nextToken: paginationToken }
    //   }
    // } = await API.graphql(graphqlOperation(getBookingByStatus, bookingFilter))

    const { data: bookingData } = await axios.get(window.Config.BOOKING_FETCH, {
      headers: {
        Authorization: credentials.accessToken,
        'Content-Type': 'application/json'
      }
    })

    let bookings = bookingData.map((booking) => new Booking(booking))

    console.table(bookings)

    commit('SET_BOOKINGS', bookings)
    commit('SET_BOOKING_PAGINATION', paginationToken)

    Loading.hide()
    console.groupEnd()
  } catch (err) {
    Loading.hide()
    console.error(err)
    throw new Error(err)
  }
}

/**
 *
 * Booking [Vuex Module Action](https://vuex.vuejs.org/guide/actions.html) - createBooking attempts payment charge via Payment service, and it effectively books a flight if payment is accepted.
 *
 * **NOTE**: It doesn't mutate the store
 * @param {object} context - Vuex action context (context.commit, context.getters, context.state, context.dispatch)
 * @param {object} obj - Object containing params required to create a booking
 * @param {object} obj.paymentToken - Stripe JS Payment token object
 * @param {Flight} obj.outboundFlight - Outbound Flight
 * @returns {promise} - Promise representing booking effectively made in the Booking service.
 * @example
 * // exerpt from src/pages/FlightSelection.vue
 * methods: {
 *    async payment() {
 *        let options = {
 *           name: this.form.name,
 *           address_zip: this.form.postcode,
 *           address_country: this.form.country
 *        }
 *
 *        try {
 *            const { token, error } = await stripe.createToken(card, options);
 *            this.token.details = token;
 *            this.token.error = error;
 *
 *            if (this.token.error) throw this.token.error;
 *
 *            await this.$store.dispatch("bookings/createBooking", {
 *              paymentToken: this.token,
 *              outboundFlight: this.selectedFlight
 *            });
 *        ...
 *        }
 */
export async function createBooking(
  { rootState, rootGetters },
  { paymentToken, outboundFlight }
) {
  console.group('store/bookings/actions/createBooking')

  const credentials = {
    idToken: rootGetters['profile/idToken'],
    accessToken: rootGetters['profile/accessToken']
  }

  try {
    const customerEmail = rootState.profile.user.attributes.email

    console.info(
      `Processing payment before proceeding to book flight ${outboundFlight}`
    )
    let accessToken = credentials.accessToken

    let chargeToken = await processPayment({
      paymentToken,
      outboundFlight,
      customerEmail,
      accessToken
    })

    console.info(
      `Creating booking with token ${chargeToken} for flight ${outboundFlight}`
    )

    Loading.show({ message: 'Creating a new booking...' })

    const processBookingInput = {
      chargeToken: chargeToken,
      outboundFlight: outboundFlight.id
    }

    axios.put(window.Config.BOOKING_CREATE, processBookingInput)

    // const {
    //   // @ts-ignore
    //   data: {
    //     processBooking: { id: bookingProcessId }
    //   }
    // } = await API.graphql(
    //   graphqlOperation(processBookingMutation, processBookingInput)
    // )

    // console.log(`Booking Id: ${bookingProcessId}`)
    console.groupEnd()
    return true
    // return bookingProcessId
  } catch (err) {
    throw err
  }
}
