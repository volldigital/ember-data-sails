import RESTAdapter from "@ember-data/adapter/rest";

export default class PostAdapter extends RESTAdapter {
  namespace = "api/v1";
  host = "http://localhost:1337";
}
