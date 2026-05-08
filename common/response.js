exports.successResponse = (res, message, data = "", statusCode = 200) => {
  const response = {
    success: true,
    status: "success",
    message,
  };

  if (data !== "") {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

exports.failResponse = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    status: "fail",
    message,
  });
};

exports.errorResponse = (res, message, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    status: "error",
    message,
  });
};
