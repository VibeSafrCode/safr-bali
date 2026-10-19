import {clientCardDestinations,clientCardActiveServices} from './client-card-runtime';
import {createClientDestinationApi} from './client-destination-api';
export const {clientDestinationById,clientActiveDestinations,clientActiveServicesById}=createClientDestinationApi({clientCatalogDestinations:clientCardDestinations,inspectClientCatalogActiveServices:clientCardActiveServices});
